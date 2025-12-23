// build.js
const fs = require("fs");

let code = fs.readFileSync("public/app.template.js", "utf8");
code = code.replace(/%%SUPABASE_URL%%/g, process.env.SUPABASE_URL || "");
code = code.replace(/%%SUPABASE_ANON_KEY%%/g, process.env.SUPABASE_ANON_KEY || "");
fs.writeFileSync("public/app.js", code);

console.log("public/app.js generated with env vars.");
