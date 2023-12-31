const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Mail Send Related
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
  username: 'api',
  key: process.env.MAIL_GUN_API_Key,
});

const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.c29ia8d.mongodb.net/?retryWrites=true&w=majority`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //     await client.connect();
    //   Connect to the Databases
    const menuCollection = client.db('bistroDb').collection('menu');
    const userCollection = client.db('bistroDb').collection('users');
    const reviewsCollection = client.db('bistroDb').collection('reviews');
    const cartCollection = client.db('bistroDb').collection('carts');
    const paymentCollection = client.db('bistroDb').collection('payments');

    // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1h',
      });
      res.send({ token });
    });

    // middlewares
    const verifyToken = (req, res, next) => {
      // console.log('inside verified token', req.headers.authorization);
      if (!req.headers?.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' });
        }
        req.decoded = decoded;
        next();
      });
    };

    // user verify admin after verify token
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    };

    app.get('/', (req, res) => {
      res.send('boss is sitting...');
    });

    // users related apis
    app.get('/users', verifyToken, async (req, res) => {
      console.log(req.decoded);
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    });

    app.post('/users', async (req, res) => {
      const user = req.body;
      // insert email if user doesn't exists:
      // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
      const query = { email: user?.email };
      const existingUser = await userCollection.findOne(query);
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null });
      }
      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    app.patch(
      '/users/admin/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: 'admin',
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    // menu related apis
    // get all menus from database
    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(query);
      console.log(result);
      res.send(result);
    });

    app.patch('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const item = req.body;
      const updateDocument = {
        $set: {
          name: item?.name,
          category: item?.category,
          price: item?.price,
          recipe: item?.recipe,
          image: item?.image,
        },
      };
      const result = await menuCollection.updateOne(filter, updateDocument);
      res.send(result);
    });

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const item = req.body;
      const result = await menuCollection.insertOne(item);
      res.send(result);
    });

    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    //     get all menus from database
    app.get('/reviews', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });

    app.listen(port, () => {
      console.log(`Bistro boss is sitting on port ${port}`);
    });

    // carts collection
    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/carts', async (req, res) => {
      const cartItem = req.body;
      const result = await cartCollection.insertOne(cartItem);
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card'],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get('/payments/:email', verifyToken, async (req, res) => {
      const query = { email: req?.params?.email };
      if (req?.params?.email !== req?.decoded?.email) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post('/payments', async (req, res) => {
      const payment = req?.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // carefully delete each item from the card
      console.log('payment info', payment);
      const query = {
        _id: {
          $in: payment?.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);

      // send user email about payment conformation
      mg.messages
        .create(process.env.MAIL_sENDING_DOMAIN, {
          from: 'Mailgun Sandbox <postmaster@sandbox4cf90fede56f411da99e6119b15235f8.mailgun.org>',
          to: ['mahfujurrahman06627@gmail.com'],
          subject: 'Bistro Boss Order Conformation',
          text: 'Testing some Mailgun awesomness!',
          html: `
            <div>
              <h2>Thank you for your order</h2>
              <h4>Your Transaction Id: <strong>${payment.transactionId}</strong><h4>
              <p>We would like to get your feedback about the food</P>
            </div>
          `,
        })
        .then((msg) => console.log(msg)) // logs response data
        .catch((err) => console.log(err)); // logs any error`;

      res.send({ paymentResult, deleteResult });
    });

    // stats or analytics
    app.get('/admin-stats', verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const menuItems = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      // this is not the best away
      // const payments = await paymentCollection.find().toArray();
      // const revenue = payments.reduce(
      //   (total, payment) => total + payment.price,
      //   0
      // );

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: '$price',
              },
            },
          },
          {
            $project: {
              _id: 0,
              totalRevenue: {
                $round: ['$totalRevenue', 2],
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;

      res.send({
        users,
        menuItems,
        orders,
        revenue,
      });
    });

    // order status
    /**
     * -------------------------------
     *      NON-Efficient Way
     * --------------------------------
     * 1. load all the payments
     * 2. for every menuItemsIds (which is an array), go find the item for menu collection
     * 3. for every item in the menu collection that you found from a payment entry (document)f
     */

    // Efficient Way
    // using aggregate
    app.get('/order-stats', verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: '$menuItemIds',
          },
          {
            $lookup: {
              from: 'menu',
              let: { menuItemId: { $toObjectId: '$menuItemIds' } },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $eq: ['$_id', '$$menuItemId'],
                    },
                  },
                },
              ],
              as: 'menuItems',
            },
          },
          {
            $unwind: '$menuItems',
          },
          {
            $group: {
              _id: '$menuItems.category',
              quantity: {
                $sum: 1,
              },
              revenue: {
                $sum: '$menuItems.price',
              },
            },
          },
          {
            $project: {
              _id: 0,
              category: '$_id',
              quantity: '$quantity',
              revenue: '$revenue',
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    //     await client.close();
  }
}
run().catch(console.dir);

/**
 * -----------------------------------
 *        NAMING CONVENTION
 * -----------------------------------
 * app.get('/users')
 * app.get('/users/:id')
 * app.post('/users')
 * app.put('/users/:id')
 * app.patch('/users/:id')
 * app.delete('/users/:id')
 */
