const jwt = require('jsonwebtoken');
module.exports = async function auth(req, res, next) {
    //console.log('Auth middleware called:WEB');
   // console.log("token:", req.cookies.token);
    const token = req.cookies.token;      // artık burada
if (!token) return  res.redirect('/auth/login');
req.user = jwt.verify(token, process.env.JWT_SECRET); // token'ı doğruluyoruz ve user bilgisini req.user'a atıyoruz
next();
}