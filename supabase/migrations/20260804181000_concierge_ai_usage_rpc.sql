-- RPC atómica para acumular uso diario del Concierge AI
CREATE OR REPLACE FUNCTION ai_usage_add(
  p_tenant_id text, p_fecha date, p_model text,
  p_tin integer, p_tout integer, p_cost numeric
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO ai_usage (tenant_id, fecha, model, tokens_in, tokens_out, cost_usd, messages)
  VALUES (p_tenant_id, p_fecha, p_model, p_tin, p_tout, p_cost, 1);
END;
$$;
