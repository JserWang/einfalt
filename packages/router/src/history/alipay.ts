import { promisify } from '../utils'
import { INJECT_QUERY_KEY } from '../constants'
import { HistoryLocation, RouterHistory } from './common'

const MAX_STACK_LENGTH = 10

export function createAlipayHistory(): RouterHistory {
  function push(to: HistoryLocation, params: { events: any }) {
    return promisify(my.navigateTo)({ url: to, ...params })
  }

  function switchTab(to: string) {
    return promisify(my.switchTab)({ url: to })
  }

  function reLaunch(to: string) {
    return promisify(my.reLaunch)({ url: to })
  }

  function replace(to: string) {
    return promisify(my.redirectTo)({ url: to })
  }

  function go(delta: number) {
    if (delta < 1) {
      delta = 1
    }
    return promisify(my.navigateBack)({ delta })
  }

  function getCurrentRoute() {
    const pages = getCurrentPages() as unknown as tinyapp.IPageInstance<any>[]
    const currentPage = pages[pages.length - 1]
    return _normalizePage(currentPage)
  }

  function getRoutes() {
    return (getCurrentPages() as unknown as tinyapp.IPageInstance<any>[]).map(page => _normalizePage(page))
  }

  function getPagesLength() {
    return getCurrentPages().length
  }

  function _normalizePage(page: tinyapp.IPageInstance<any>) {
    return {
      route: page.route,
      params: page.data[INJECT_QUERY_KEY] || {}
    }
  }

  return {
    MAX_STACK_LENGTH,
    push,
    go,
    replace,
    switchTab,
    reLaunch,
    getCurrentRoute,
    getRoutes,
    getPagesLength
  }
}
