import { ErrorTypes, isNavigationFailure } from './errors'
import { RouterHistory } from './history/common'
import { parseURL } from './location'
import { RouterMatcher } from './matcher'
import { guardToPromiseFn } from './navigationGuard'
import { patchPage } from './patch'
import { stringifyQuery } from './query'
import {
  Lazy,
  NavigationGuard,
  NavigationHookAfter,
  RouteLocation,
  RouteLocationNormalized,
  RouteRecord,
  RouteRecordName
} from './types'
import { assign } from './utils'
import { useCallbacks } from './utils/callbacks'

export interface RouterOptions {
  history: RouterHistory
  routes: RouteRecord[]
}

export interface Router {
  /**
   * Original options object passed to create the Router
   */
  readonly options: RouterOptions
  /**
   * Checks if a route with a given name exists
   *
   * @param name - Name of the route to check
   */
  hasRoute(name: RouteRecordName): boolean
  /**
   * Get a full list of all the {@link RouteRecord | route records}.
   */
  getRoutes(): RouteRecord[]
  /**
   * Programmatically navigate to a new URL by pushing an entry in the history
   * stack.
   *
   * @param to - Route location to navigate to
   */
  push(to: RouteLocation): Promise<unknown>
  /**
   * Programmatically navigate to a new URL by replacing the current entry in
   * the history stack.
   *
   * @param to - Route location to navigate to
   */
  replace(to: RouteLocation): Promise<unknown>
  /**
    * Go back in history if possible by calling `history.back()`. Equivalent to
    * `router.go(-1)`.
    */
  back(): ReturnType<Router['go']>
  /**
   * Allows you to move forward or backward through the history. Calls
   * `history.go()`.
   *
   * @param delta - The position in the history to which you want to move,
   * relative to the current page
   */
  go(delta: number): void
  /**
   * Add a navigation guard that executes before any navigation. Returns a
   * function that removes the registered guard.
   *
   * @param guard - navigation guard to add
   */
  beforeEach(guard: NavigationGuard): () => void

  /**
   * Add a navigation hook that is executed after every navigation. Returns a
   * function that removes the registered hook.
   *
   * @example
   * ```js
   * router.afterEach((to, from, failure) => {
   *   if (isNavigationFailure(failure)) {
   *     console.log('failed navigation', failure)
   *   }
   * })
   * ```
   *
   * @param guard - navigation hook to add
   */
  afterEach(guard: NavigationHookAfter): () => void

  getCurrentRoute(): RouteLocationNormalized
}

export function createRouter(this: any, options: RouterOptions): Router {
  const matcher = new RouterMatcher(options.routes)
  const routerHistory = options.history
  const beforeGuards = useCallbacks<NavigationGuard>()
  const afterGuards = useCallbacks<NavigationHookAfter>()

  function getRoutes() {
    return matcher.getRoutes().map(routeMatcher => routeMatcher.record)
  }

  function hasRoute(name: RouteRecordName): boolean {
    return !!matcher.getRouteRecordMatcherByName(name)
  }

  function findPageInStack(fullPagePath: string) {
    const routes = routerHistory.getRoutes()
    const targetIndex = routes.findIndex((item) => {
      const normalizePage = normalizeRouteByPage(item.route, item.params)
      return normalizePage.fullPagePath === fullPagePath
    })

    // eslint-disable-next-line unicorn/prefer-includes
    if (targetIndex > -1) {
      return {
        page: routes[targetIndex],
        index: targetIndex,
        delta: routes.length - targetIndex - 1
      }
    }
    return null
  }

  function triggerAfterEach(to: RouteLocationNormalized, from: RouteLocationNormalized): void {
    for (const guard of afterGuards.list()) {
      guard(to, from)
    }
  }

  function normalizeRoute(route: {record: RouteRecord; params: any}): RouteLocationNormalized {
    const searchString = `${Object.keys(route.params).length > 0 ? `?${stringifyQuery(route.params)}` : ''}`
    return {
      name: route.record?.name || '',
      path: route.record?.path || '',
      page: route.record?.page || '',
      fullPath: `${route.record?.path}${searchString}`,
      fullPagePath: `${route.record?.page}${searchString}`,
      params: route.params,
      meta: route.record?.meta || {}
    }
  }

  function locationAsObject(
    to: RouteLocation | RouteLocationNormalized
  ): Exclude<RouteLocation, string> | RouteLocationNormalized {
    return typeof to === 'string'
      ? parseURL(to)
      : assign({}, to)
  }

  function push(to: RouteLocation) {
    return changeLocation(to)
  }

  function replace(to: RouteLocation | RouteLocationNormalized) {
    return changeLocation(assign(locationAsObject(to), { replace: true }))
  }

  function changeLocation(to: RouteLocation, from?: RouteLocation): Promise<unknown> {
    const targetLocation = matcher.resolve(to)

    const currentRoute = getCurrentRoute()
    const toRoute = normalizeRoute(targetLocation)

    // Use replace when current page stack length >= max
    if (routerHistory.getPagesLength() >= routerHistory.MAX_STACK_LENGTH) {
      to.replace = true
    }

    // 当跳转目标页与当前页相同时，不去路由栈中查找
    if (toRoute.fullPagePath !== currentRoute.fullPagePath) {
      const found = findPageInStack(toRoute.fullPagePath)
      // 当目标页面在路由栈中，执行back
      if (found && found.index > -1) {
        return routerHistory.go(found.delta)
      }
    }

    const guards: Lazy<any>[] = []
    for (const guard of beforeGuards.list()) {
      guards.push(guardToPromiseFn(guard, toRoute, currentRoute))
    }

    return runGuardQueue(guards)
      .catch((err) => {
        // 当来自跳转时，设置flag让后续跳转逻辑不再执行，否则catch后还会继续执行then
        if (isNavigationFailure(err, ErrorTypes.NAVIGATION_GUARD_REDIRECT) && !from) {
          changeLocation(locationAsObject(err.to), err.from)
          return Promise.resolve('FROM_REDIRECT')
        } else if (!from) {
          return Promise.reject(err)
        }
        return Promise.resolve('')
      })
      .then(async(flag) => {
        if (flag === 'FROM_REDIRECT') {
          return Promise.resolve()
        }

        let method
        let params = {}
        if (typeof to !== 'string' && to.reLaunch) {
          method = routerHistory.reLaunch
        } else if (toRoute.meta?.isTab) {
          method = routerHistory.switchTab
        } else if (typeof to !== 'string' && to.replace) {
          method = routerHistory.replace
        } else {
          params = { events: (to as any).events }
          method = routerHistory.push
        }

        // 跳转
        const result = await method(`/${toRoute.fullPagePath}`, params)
        triggerAfterEach(toRoute, currentRoute)

        return result
      })
  }

  const go = (delta: number) => routerHistory.go(delta)

  function getCurrentRoute(): RouteLocationNormalized {
    const page = routerHistory.getCurrentRoute()
    return normalizeRouteByPage(page.route, page.params)
  }

  function normalizeRouteByPage(route: string, params: Record<string, any>) {
    const recordMatcher = matcher.getRouteRecordMatcherByPage(route)
    if (recordMatcher) {
      return normalizeRoute({
        record: recordMatcher.record,
        params
      })
    }

    return {
      name: '',
      path: '',
      fullPath: '',
      fullPagePath: '',
      page: '',
      params: {},
      meta: {}
    }
  }

  patchPage()

  return {
    options,
    hasRoute,
    getRoutes,
    push,
    replace,
    back: () => go(1),
    go,
    beforeEach: beforeGuards.add,
    afterEach: afterGuards.add,
    getCurrentRoute
  }
}

function runGuardQueue(guards: Lazy<any>[]): Promise<void> {
  return guards.reduce(
    (promise, guard) => promise.then(() => guard()),
    Promise.resolve()
  )
}
