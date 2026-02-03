export const onRequestGet: PagesFunction = async () => {
  return Response.json({ ok: true, time: new Date().toISOString() })
}
