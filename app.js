const supabaseUrl = "https://qhfyudkkvmgpsukdcylj.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFoZnl1ZGtrdm1ncHN1a2RjeWxqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyNzAzNTMsImV4cCI6MjA4Nzg0NjM1M30.s2TPO4Zf55rGwHnMTdLEKLIQe2Mhpa-FVX8v2Ee_MPk";

// Initialize Supabase
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Your application logic here...