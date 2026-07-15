const axios = require("axios");

// ---------- Stripe (lazy load) ----------
let stripeInstance = null;

const getStripe = async () => {
  if (!stripeInstance) {
    try {
      const stripeModule = await import("stripe");
      stripeInstance = stripeModule.default(process.env.STRIPE_SECRET_KEY);
    } catch (err) {
      console.warn("⚠️ Stripe module not available – using mock.");
      // fallback mock for Stripe
      stripeInstance = {
        checkout: {
          sessions: {
            create: async () => ({
              url: `${process.env.FRONTEND_URL}/payment-success?mock=true`,
              id: "mock_stripe_session",
            }),
          },
        },
      };
    }
  }
  return stripeInstance;
};

// ---------- Chapa (axios only) ----------
exports.chapaPayment = async (amount, booking, user) => {
  const MOCK_CHAPA = process.env.MOCK_CHAPA !== "false";

  if (MOCK_CHAPA) {
    console.log("🔧 MOCK CHAPA: Payment initiated for booking", booking._id);
    return {
      url: `${process.env.FRONTEND_URL}/payment-success?bookingId=${booking._id}&mock=true`,
      transactionId: `mock-${booking._id}-${Date.now()}`,
    };
  }

  try {
    const payload = {
      amount,
      currency: "ETB",
      email: user.email,
      first_name: user.name?.split(" ")[0] || "Customer",
      last_name: user.name?.split(" ").slice(1).join(" ") || "User",
      tx_ref: `rent-${booking._id}-${Date.now()}`,
      callback_url: `${process.env.BACKEND_URL || "http://localhost:5000"}/api/v1/payments/webhook/chapa`,
      return_url: `${process.env.FRONTEND_URL}/payment-success?bookingId=${booking._id}`,
      customization: {
        title: "Car Rental",
        description: `Booking #${booking._id}`.replace(
          /[^a-zA-Z0-9\-_\s.]/g,
          "",
        ),
      },
      meta: {
        bookingId: booking._id.toString(),
      },
    };

    const response = await axios.post(
      "https://api.chapa.co/v1/transaction/initialize",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.CHAPA_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    if (response.data?.data?.checkout_url) {
      return {
        url: response.data.data.checkout_url,
        transactionId: response.data.data.tx_ref,
      };
    }
    throw new Error("Chapa returned invalid response");
  } catch (error) {
    console.error(
      "Chapa error details:",
      error.response?.data || error.message,
    );
    // Fallback to mock
    return {
      url: `${process.env.FRONTEND_URL}/payment-success?bookingId=${booking._id}&mock=true`,
      transactionId: `mock-${booking._id}-${Date.now()}`,
    };
  }
};

// ---------- Stripe Payment ----------
exports.stripePayment = async (amount, booking, user) => {
  try {
    const stripe = await getStripe();
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: `Car rental #${booking._id}` },
            unit_amount: Math.round(amount * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/payment-success?bookingId=${booking._id}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment-cancel`,
      client_reference_id: booking._id.toString(),
    });
    return { url: session.url, transactionId: session.id };
  } catch (error) {
    console.error("Stripe error:", error);
    throw new Error(`Stripe payment failed: ${error.message}`);
  }
};

// ---------- Telebirr (placeholder) ----------
exports.telebirrPayment = async (amount, booking, user) => {
  return {
    url: `${process.env.FRONTEND_URL}/payment-success?bookingId=${booking._id}&mock=true`,
    transactionId: `TB-${booking._id}-${Date.now()}`,
  };
};
