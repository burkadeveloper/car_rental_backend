const express = require("express");
const router = express.Router();
const {
  createTicket,
  getTickets,
  getTicket,
  updateTicketStatus,
  addTicketResponse,
} = require("../controllers/ticketController");
const { protect, authorize } = require("../middlewares/auth");

router.use(protect);
router.post("/", createTicket);
router.post("/:id/response", addTicketResponse);

// Staff/Admin only for listing and status update
router.get("/", authorize("staff", "admin"), getTickets);
router.get("/:id", authorize("staff", "admin"), getTicket); // staff can see all; owner sees own via custom logic in controller
router.put("/:id/status", authorize("staff", "admin"), updateTicketStatus);

module.exports = router;
