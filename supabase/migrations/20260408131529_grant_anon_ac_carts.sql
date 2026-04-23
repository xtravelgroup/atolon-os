-- Grant INSERT, UPDATE, SELECT privileges to anon role on ac_carts
-- Required for BookingPopup to register abandoned cart records from the browser

GRANT SELECT, INSERT, UPDATE ON ac_carts TO anon;
