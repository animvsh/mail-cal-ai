export const onRequestGet: PagesFunction = async () => {
  // Client manages auth state via localStorage
  return Response.json({ isAuthenticated: false })
}
