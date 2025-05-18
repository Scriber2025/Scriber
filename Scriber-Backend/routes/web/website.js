const router = require('express').Router();

router.get('/contact', (req, res) => {
  res.render('pages/contact', { 
    title: 'Contact',
    message: null
  });
});

router.get('/',  (req, res, next) => {
    res.render('pages/index', { 
      title: 'Home',
      message: null
    });
});


module.exports = router;