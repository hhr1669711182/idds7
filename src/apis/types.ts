export type PageParams = {
  page: number
  pageSize: number
}

export type PageResult<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}
