const Ticket = require("../models/Ticket");
const { createNotification } = require("../services/notificationService");

// @desc    Create a support ticket
// @route   POST /api/v1/tickets
// @access  Private (customer)
exports.createTicket = async (req, res, next) => {
  try {
    const ticket = new Ticket({
      user: req.user.id,
      subject: req.body.subject,
      message: req.body.message,
      attachments: req.body.attachments || [],
    });
    await ticket.save();
    // Notify staff
    // (optional) emit socket event to staff room
    res.status(201).json(ticket);
  } catch (error) {
    next(error);
  }
};

// @desc    Get all tickets (staff/admin)
// @route   GET /api/v1/tickets
// @access  Staff/Admin
exports.getTickets = async (req, res, next) => {
  try {
    const tickets = await Ticket.find()
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (error) {
    next(error);
  }
};

// @desc    Get a single ticket
// @route   GET /api/v1/tickets/:id
// @access  Staff/Admin or owner
exports.getTicket = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id).populate(
      "user",
      "name email",
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    // Allow if owner or staff/admin
    if (
      ticket.user._id.toString() !== req.user.id &&
      !["staff", "admin"].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    res.json(ticket);
  } catch (error) {
    next(error);
  }
};

// @desc    Update ticket status (staff/admin)
// @route   PUT /api/v1/tickets/:id/status
// @access  Staff/Admin
exports.updateTicketStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const ticket = await Ticket.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true },
    );
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    // Notify user
    await createNotification(
      ticket.user,
      "Ticket Update",
      `Your ticket "${ticket.subject}" is now ${status}.`,
    );
    res.json(ticket);
  } catch (error) {
    next(error);
  }
};

// @desc    Add a response to a ticket (staff or user)
// @route   POST /api/v1/tickets/:id/response
// @access  Private
exports.addTicketResponse = async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: "Ticket not found" });
    // Check if user is owner or staff
    if (
      ticket.user.toString() !== req.user.id &&
      !["staff", "admin"].includes(req.user.role)
    ) {
      return res.status(403).json({ message: "Not authorized" });
    }
    ticket.responses.push({
      user: req.user.id,
      message: req.body.message,
    });
    ticket.status = "in-progress"; // auto update
    await ticket.save();
    // Notify the other party
    const recipient =
      ticket.user.toString() === req.user.id ? ticket.assignedTo : ticket.user;
    if (recipient) {
      await createNotification(
        recipient,
        "New Response",
        `New response on ticket "${ticket.subject}"`,
      );
    }
    res.json(ticket);
  } catch (error) {
    next(error);
  }
};
