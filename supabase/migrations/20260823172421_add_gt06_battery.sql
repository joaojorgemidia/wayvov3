-- Nível de bateria do rastreador GT06 (do pacote de heartbeat/status) — % aproximado,
-- convertido pelo servidor TCP a partir do byte de "voltage level" (enum 0-6 do
-- protocolo, onde 6 = bateria alta/cheia). Ver gt06-server/src/index.js.
ALTER TABLE public.gt06_devices ADD COLUMN battery SMALLINT;
