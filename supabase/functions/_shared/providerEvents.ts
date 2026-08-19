export function isDuplicateProviderEvent(error: { code?: string } | null | undefined) {
  return error?.code === "23505";
}

export function shouldResumeDuplicateProviderEvent(processedAt: string | null | undefined) {
  return !processedAt;
}
