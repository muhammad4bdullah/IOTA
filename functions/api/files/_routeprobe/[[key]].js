export async function onRequestGet({ params }) {
  return new Response(JSON.stringify({ key: params.key }), {
    headers: { "content-type": "application/json" },
  });
}
