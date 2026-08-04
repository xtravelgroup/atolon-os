Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");
  try {
    const { tipo_evento, fecha, pax, detalles } = await req.json();
    // Cotización preliminar estimada — luego el humano ajusta
    const precio_por_pax = tipo_evento?.toLowerCase().includes("boda") ? 480000 : 380000;
    const subtotal = pax * precio_por_pax;
    return new Response(JSON.stringify({
      tipo_evento, fecha, pax, subtotal_estimado: subtotal, precio_por_pax,
      notas: "Cotización preliminar. Un asesor te contactará para confirmar detalles.",
      requiere_asesor: true,
    }), { headers: { "content-type": "application/json", "Access-Control-Allow-Origin": "*" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
