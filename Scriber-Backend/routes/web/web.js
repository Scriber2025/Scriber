const router = require('express').Router();



app.get('/contact', (req, res) => {
  res.render('pages/contact', { title: 'About Scriber' });
});

app.get('/', (req, res) => {
  res.render('pages/index', { title: 'Scriber' });
});

module.exports = router;