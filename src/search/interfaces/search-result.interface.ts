export interface PaginationMetadata {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginationResult<T> {
  data: T[];
  pagination: PaginationMetadata;
}

export interface SearchResponse {
  query: string;
  videos: PaginationResult<Record<string, unknown>>;
  speakers: PaginationResult<Record<string, unknown>>;
}
