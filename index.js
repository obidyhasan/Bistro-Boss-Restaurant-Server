const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId, Admin } = require("mongodb");

// Send Email
const formData = require("form-data");
const Mailgun = require("mailgun.js");
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY,
});

// Middleware
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Bistro Boss Is Running...");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.0m3jt.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const menuCollection = client.db("bistroBossDB").collection("menu");
    const reviewCollection = client.db("bistroBossDB").collection("reviews");
    const cartCollection = client.db("bistroBossDB").collection("carts");
    const userCollection = client.db("bistroBossDB").collection("users");
    const paymentCollection = client.db("bistroBossDB").collection("payments");

    // Verify Token Middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decode) => {
        if (err) {
          return res.status(401).send({ message: "unauthorized access" });
        }
        req.decode = decode;
        next();
      });
    };

    // use verify admin after verifyToken
    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === "admin";

      if (!isAdmin) {
        return res.status(403).send({ message: "forbidden access" });
      }
      next();
    };

    // JWT Token APIs
    app.post("/api/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1d",
      });
      res.send({ token });
    });

    // Get Menu Item
    app.get("/api/menus", async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    // Add Product
    app.post("/api/menus", verifyToken, verifyAdmin, async (req, res) => {
      const productInfo = req.body;
      const result = await menuCollection.insertOne(productInfo);
      res.send(result);
    });

    // Get Single Product
    app.get("/api/menus/:id", async (req, res) => {
      const { id } = req.params;
      const filter = { _id: new ObjectId(id) };
      const result = await menuCollection.findOne(filter);
      res.send(result);
    });

    // Update Single Product
    app.patch("/api/menus/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const productInfo = req.body;
      const query = { _id: new ObjectId(id) };
      const updateDoc = {
        $set: {
          name: productInfo.name,
          image: productInfo.image,
          category: productInfo.category,
          price: productInfo.price,
          recipe: productInfo.recipe,
        },
      };

      const result = await menuCollection.updateOne(query, updateDoc);
      res.send(result);
    });

    // Delete Product
    app.delete("/api/menus/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await menuCollection.deleteOne(query);
      res.send(result);
    });

    app.get("/api/reviews", async (req, res) => {
      const result = await reviewCollection.find().toArray();
      res.send(result);
    });

    // User APIS
    // Get User
    app.get("/api/users", verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    // Post User
    app.post("/api/users", async (req, res) => {
      const userInfo = req.body;
      // insert email if user doesn't exists:
      // you can do this many ways (1. email unique, 2. upsert, 3. simple check)
      const query = { email: userInfo.email };
      const userExisting = await userCollection.findOne(query);

      if (userExisting) {
        return res.send({ message: "User already exists", insertedId: null });
      }

      const result = await userCollection.insertOne(userInfo);
      res.send(result);
    });

    // Update User Role
    app.patch(
      "/api/user/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { id } = req.params;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            role: "admin",
          },
        };
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // Delete User
    app.delete("/api/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // Check User are admin or User
    app.get("/api/user/admin/:email", verifyToken, async (req, res) => {
      const { email } = req.params;

      if (email !== req.decode.email) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = { email: email };
      const user = await userCollection.findOne(query);
      let isAdmin = false;
      if (user) {
        isAdmin = user?.role === "admin";
      }
      res.send({ isAdmin });
    });

    // Get Cart by Email
    app.get("/api/carts", async (req, res) => {
      const { email } = req.query;
      const query = { userEmail: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    // Post Cart
    app.post("/api/carts", async (req, res) => {
      const cartInfo = req.body;
      const result = await cartCollection.insertOne(cartInfo);
      res.send(result);
    });

    // Delete Cart
    app.delete("/api/carts/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });

    // Payment Related
    app.post("/api/create-payment-intent", async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({ clientSecret: paymentIntent.client_secret });
    });

    // crate payment history
    app.post("/api/payments", verifyToken, async (req, res) => {
      const payment = req.body;
      const paymentResult = await paymentCollection.insertOne(payment);

      // carefully delete each item from the cart
      const query = {
        _id: {
          $in: payment.cartIds.map((id) => new ObjectId(id)),
        },
      };
      const deleteResult = await cartCollection.deleteMany(query);

      mg.messages
        .create("sandboxac9b656e56eb470d99bfa7ee8fe557d4.mailgun.org", {
          from: "Excited User <mailgun@sandboxac9b656e56eb470d99bfa7ee8fe557d4.mailgun.org>",
          to: ["obidyhasan@gmail.com"],
          subject: "Bistro Boss Order Confirmation",
          text: "Thank you for your order",
          html: `<div>
            <h3>Your Transaction Id: ${payment.transactionId}</h3>
            <p>We would like to get your feedback about the food</p>
          </div>`,
        })
        .then((msg) => console.log(msg)) // logs response data
        .catch((err) => console.error(err)); // logs any error

      res.send({ paymentResult, deleteResult });
    });

    app.get("/api/payments/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      if (email !== req.decode.email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // Admin Stats
    app.get("/api/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      const users = await userCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();
      const products = await menuCollection.estimatedDocumentCount();

      const result = await paymentCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$price",
              },
            },
          },
        ])
        .toArray();

      const revenue = result.length > 0 ? result[0].totalRevenue : 0;
      res.send({ users, products, orders, revenue });
    });

    // get all category include each category how many quantity is sold and how many revenue create
    app.get("/api/admin-chart", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentCollection
        .aggregate([
          {
            $unwind: "$menuItemIds",
          },
          {
            $lookup: {
              from: "menu",
              localField: "menuItemIds",
              foreignField: "_id",
              as: "menuItems",
            },
          },
          {
            $unwind: "$menuItems",
          },
          {
            $group: {
              _id: "$menuItems.category",
              quantity: { $sum: 1 },
              totalRevenue: { $sum: "$menuItems.price" },
            },
          },
          {
            $project: {
              _id: 0,
              category: "$_id",
              quantity: "$quantity",
              totalRevenue: "$totalRevenue",
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    // await client.connect();
    // await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Bistro Boss listening on port ${port}`);
});
