import { parseQueryObj } from '../query'
import { HistoryLocation, HistoryState, RouterHistory } from './common'

const MAX_STACK_LENGTH = 10

export function createWechatHistory(): RouterHistory {
  function push(to: HistoryLocation, data?: HistoryState) {
    const params: WechatMiniprogram.NavigateToOption = {
      url: to,
      events: data?.event
    }

    return wx.navigateTo(params)
  }

  function switchTab(url: string) {
    return wx.switchTab({ url })
  }

  function reLaunch(url: string) {
    return wx.reLaunch({ url })
  }

  function go(delta: number) {
    if (delta < 1) {
      delta = 1
    }
    return wx.navigateBack({ delta })
  }

  function replace(url: string) {
    return wx.redirectTo({ url })
  }

  function getRoutes() {
    return getCurrentPages().map(page => _normalizePage(page))
  }

  function getCurrentRoute() {
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    return _normalizePage(currentPage)
  }

  function getPagesLength() {
    return getCurrentPages().length
  }

  function _normalizePage(page: WechatMiniprogram.Page.Instance<any, any>) {
    return {
      route: page.route,
      params: parseQueryObj(page.options)
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
