require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const plaidRouter = require('./routes/plaid');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));
app.use('/auth', authRouter);
app.use('/plaid', plaidRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`iBag API listening on ${PORT}`));
