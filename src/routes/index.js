const express = require('express');
const router = express.Router();

const v1Routes = require('./v1');

// API versioning
router.use('/v1', v1Routes);

// Default to v1
router.use('/', v1Routes);

module.exports = router;
