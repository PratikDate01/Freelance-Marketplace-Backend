const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

console.log("Client ID from env:", process.env.GOOGLE_CLIENT_ID);
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Build absolute callback URL. Use BASE_URL or RENDER_EXTERNAL_URL in prod; fallback to localhost for dev
      callbackURL:
        (process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 5000}`) +
        "/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      const email = profile.emails[0].value;
      let user = await User.findOne({ email });

      if (!user) {
        // New user — save basic data, ask for username later
        user = await User.create({
          email,
          name: profile.displayName,
          googleId: profile.id,
          isOAuth: true,
        });
      }

      return done(null, user);
    }
  )
);

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser((id, done) => {
  User.findById(id).then((user) => done(null, user));
});
