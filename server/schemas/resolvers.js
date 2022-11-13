const api = require("../utils/api");
const {
  User,
  Creation,
  Product,
  Category,
  Order,
  BusinessCategory,
  BusinessType,
} = require("../models");
const { signToken } = require("../utils/auth");
const { AuthenticationError } = require('apollo-server-express');
const stripe = require('stripe')('sk_test_51GVpEwC4q7PuQFomp0Q5oSBT1mm1vbZhhIH0u9ZM86ORb6yQy9h72h8pa91rUfrfJoeCVOurSf1UK4bZJfRtd8wz00SkKli8cd');

const resolvers = {
  Query: {
    me: async (parent, args, context) => {
      if (context.user) {
        const userData = await User.findOne({ _id: context.user._id })
          .select("-__v -password")
          .populate("creations");

        return userData;
      }

      throw new AuthenticationError("Not logged in");
    },
    user: async (parent, { username }) => {
      return User.findOne({ username })
        .select("-__v -password")
        .populate("creations");
    },
    creations: async (parent, { username }) => {
      const params = username ? { username } : {};
      return Creation.find(params).sort({ createdAt: -1 });
    },
    creation: async (parent, { _id }) => {
      return Creation.findOne({ _id });
    },
    categories: async () => {
      return await Category.find();
    },
    products: async () => {
      return await Product.find();
    },
    product: async (parent, { _id }) => {
      return await Product.findById(_id).populate("category");
    },
    // user: async (parent, args, context) => {
    //   if (context.user) {
    //     const user = await User.findById(context.user._id).populate({
    //       path: 'orders.products',
    //       populate: 'category'
    //     });

    //     user.orders.sort((a, b) => b.purchaseDate - a.purchaseDate);

    //     return user;
    //   }

    //   throw new AuthenticationError('Not logged in');
    // },
    order: async (parent, { _id }, context) => {
      if (context.user) {
        const user = await User.findById(context.user._id).populate({
          path: "orders.products",
          populate: "category",
        });

        return user.orders.id(_id);
      }

      throw new AuthenticationError("Not logged in");
    },
    checkout: async (parent, args, context) => {
      const url = new URL(context.headers.referer).origin;
      const order = new Order({ products: args.products });

      const { products } = await order.populate("products");
      const line_items = [];

      for (let i = 0; i < products.length; i++) {
        // generate product id
        const product = await stripe.products.create({
          name: products[i].name,
        });

        // generate price id using the product id
        const price = await stripe.prices.create({
          product: product.id,
          unit_amount: products[i].price * 100,
          currency: "usd",
        });

        // add price id to the line items array
        line_items.push({
          price: price.id,
          quantity: 1,
        });
      }

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items,
        mode: "payment",
        success_url: `${url}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${url}/`,
      });

      console.log('Session', session);

      return { session: session.id, session: session.customer };

      ////////// session: session_id -original

      //////// session:customer- added by devi
    },
    businessCategories: async () => {
      return await BusinessCategory.find();
    },
    businessTypes: async (parent, { businessCategory, name }) => {
      const params = {};

      if (businessCategory) {
        params.businessCategory = businessCategory;
      }

      if (name) {
        params.name = {
          $regex: name,
        };
      }

      return (await BusinessType.find().populate("businessCategory")).filter(
        (a) => a.businessCategory.name == businessCategory
      );
    },
    api: async (parent, args, context) => {
      if (context.user) {
        const response = await api.generateImage({
          prompt: args.promptInput,
        });
        return response;
      }

      throw new AuthenticationError("Not logged in");
    },
  },

  Mutation: {
    addUser: async (parent, args) => {
      const user = await User.create(args);
      const token = signToken(user);

      return { token, user };
    },
    login: async (parent, { email, password }) => {
      const user = await User.findOne({ email });

      if (!user) {
        throw new AuthenticationError("Incorrect credentials");
      }

      const correctPw = await user.isCorrectPassword(password);

      if (!correctPw) {
        throw new AuthenticationError("Incorrect credentials");
      }

      const token = signToken(user);
      return { token, user };
    },
    addCreation: async (parent, args, context) => {
      if (context.user) {
        const creation = await Creation.create({
          ...args,
          username: context.user.username,
        });

        await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $push: { creations: creation._id } },
          { new: true }
        );

        return creation;
      }
    },
    addCredits: async (parent, { credits }, context) => {
      if (context.user) {
        const totalCredits = await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $inc: { credits: credits } },
          { new: true }
        );

        return totalCredits;
      }
      throw new AuthenticationError("Not logged in");
    },
    restCredits: async (parent, { credits }, context) => {
      if (context.user) {
        const decrement = Math.abs(credits) * -1;
        const totalCredits = await User.findByIdAndUpdate(
          { _id: context.user._id },
          { $inc: { credits: decrement } },
          { new: true }
        );

        return totalCredits;
      }
      throw new AuthenticationError("Not logged in");
    },
    addOrder: async (parent, { products }, context) => {
      if (context.user) {
        const order = new Order({ products });
        await User.findByIdAndUpdate(context.user._id, {
          $push: { orders: order },
        });
        return order;
      }
      throw new AuthenticationError("Not logged in");
    },

    updateOrder: async (parent, { sessionId }, ) => {
     
      return await Order.findByIdAndUpdate(
        sessionId,
        { status: "paid"  },
        { new: true }
      );
        
      throw new AuthenticationError("Not logged in");
    },

    updateProduct: async (parent, { _id, quantity }) => {
      const decrement = Math.abs(quantity) * -1;

      return await Product.findByIdAndUpdate(
        _id,
        { $inc: { quantity: decrement } },
        { new: true }
      );
    },
    addBusinessCategory: async (parent, args) => {
      const businessCategory = await BusinessCategory.create(args);
      return { businessCategory };
    },
    addBusinessType: async (parent, args) => {
      const businessType = await BusinessType.create(args);
      return { businessType };
    },
  },
};

module.exports = resolvers;
