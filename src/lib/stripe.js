// importera stripe direkt från paketet
import Stripe from 'stripe';

// skapa en stripe-instans med din api-nyckel
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// exportera stripe-instansen som standard
export default stripe;
