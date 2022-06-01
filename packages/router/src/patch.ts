import { INJECT_QUERY_KEY } from './constants'
import { parseQueryObj } from './query'

export function patchPage() {
  const originalPage = Page

  Page = function(options) {
    const { onLoad } = options
    // @ts-ignore
    options.data = options.data || {}

    options.onLoad = function(query) {
      // @ts-ignore
      options.data[INJECT_QUERY_KEY] = parseQueryObj(query)
      return onLoad?.call(this, query)
    }

    return originalPage(options)
  }
}
