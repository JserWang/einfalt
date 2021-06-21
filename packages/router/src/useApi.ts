import { Router } from './router'
import { IAppOption, RouteLocationNormalized } from './types/index'

export function useRouter(): Router {
  return getApp<IAppOption>().router
}

export function useRoute(): RouteLocationNormalized {
  return useRouter().getCurrentRoute()
}
