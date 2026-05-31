const { encode } = require("next-auth/jwt");
(async () => {
  const token = await encode({
    token: { sub: "cmpsn5af10000a0pihud608un", name: "Jatin Pardhi", email: "jatin4pardhi@gmail.com" },
    secret: "dev-secret-change-me-in-prod-please-32chars",
    maxAge: 60 * 60 * 24 * 30,
  });
  process.stdout.write(token);
})();
