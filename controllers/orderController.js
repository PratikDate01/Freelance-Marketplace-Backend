const Order = require("../models/Order");
const Gig = require("../models/Gig");

exports.createOrder = async (req, res) => {
  try {
    const { gigId } = req.body;
    const buyerId = req.user.id;

    const gig = await Gig.findById(gigId).populate("sellerId");
    if (!gig) return res.status(404).json({ error: "Gig not found" });

    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + gig.deliveryTime);

    const order = new Order({
      gigId,
      buyerId,
      sellerId: gig.sellerId._id,
      amount: gig.price,
      deliveryDate,
    });

    await order.save();
    res.status(201).json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
};

exports.getMyOrders = async (req, res) => {
  try {
    const buyerId = req.user.id;
    const orders = await Order.find({ buyerId })
      .populate("gigId", "title image")
      .sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch orders" });
  }
};
