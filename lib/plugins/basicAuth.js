module.exports = {
  requestReceived: (req, res, next) => {
    let auth = req.headers.authorization;
    if (!auth) return res.send(401);

    // malformed
    let parts = auth.split(' ');
    if ('basic' != parts[0].toLowerCase()) return res.send(401);
    if (!parts[1]) return res.send(401);
    auth = parts[1];

    // credentials
    auth = new Buffer(auth, 'base64').toString();
    auth = auth.match(/^([^:]+):(.+)$/);
    if (!auth) return res.send(401);

    if (
      auth[1] !== process.env.BASIC_AUTH_USERNAME ||
      auth[2] !== process.env.BASIC_AUTH_PASSWORD
    )
      return res.send(401);

    req.prerender.authentication = {
      name: auth[1],
      password: auth[2],
    };

    return next();
  },
};
