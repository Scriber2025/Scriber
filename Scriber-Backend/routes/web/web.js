const router = require('express').Router();



router.get('/contact', (req, res) => {
  res.render('pages/contact', { title: 'About Scriber' });
});
  
router.get('/', (req, res) => {
  res.render('pages/index', { title: 'Scriber' });
});

module.exports = router;