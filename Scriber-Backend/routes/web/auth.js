const router   = require('express').Router();
const message = require('../../models/message');
const users = require('../../models/user');
const jwt = require('jsonwebtoken');
const blacklist = require('../../models/blacklist');
const auth = require('../../middlewares/authweb');

router.get('/login', async (req, res) => {
    res.render('pages/login', { 
      title: 'Login',
      message: null
    });
  });

router.get('/register', async (req, res) => {
    res.render('pages/register', { 
      title: 'Register',
      message: null
    });
  });

// @route   POST

router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
      let user = await users.findOne({ email });
      if (user) return res.status(400).json({ message: 'Email already in use' });
  
      user = new users({ name, email, password });
      await user.save();
      console.log(process.env.JWT_SECRET);
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
      if (req.accepts('html')) {
        return res
          .cookie('token', token, {
            httpOnly:false,
            secure: false,
            sameSite: 'lax',
            maxAge: 15 * 60 * 1000
          }).redirect('/chat');

      }
      res.status(200).json({ token });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
  });

router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
      const user = await users.findOne({ email }).select('+password');
      if (!user || !(await user.matchPassword(password))) {
        return res.status(401).json({ message: 'Invalid credentials' });
      }
  
      const token = jwt.sign({ id: user._id ,username:user.name }, process.env.JWT_SECRET, { expiresIn: '7d' });
      if (req.accepts('html')) {
        return res
          .cookie('token', token, {
            httpOnly: false,
            secure: true,
            sameSite: 'None',
            path: '/', 
            maxAge: 15 * 60 * 1000
          }).redirect('/chat');

      }
      res.status(200).json({ token });
      
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'Server Error' });
    }
});


router.get('/logout', auth, async (req, res) => {
  try {
    // 2) Eğer cookie üzerinden oturum yönetiyorsan, cookie’yi temizle
    res.clearCookie('token', {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax'
    });

    res.redirect('/auth/login');

  } catch (err) {
    console.error('Logout error:', err);
    if (!req.accepts('html')) {
      return res.status(500).json({ error: 'Çıkış yapılırken hata oluştu' });
    }
    res.status(500).render('error', { message: 'Sunucu hatası' });
  }
});

module.exports = router;