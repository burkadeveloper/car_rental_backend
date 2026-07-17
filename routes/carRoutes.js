const express = require("express");
const router = express.Router();
const {
  getCars,
  getCar,
  createCar,
  updateCar,
  deleteCar,
  permanentDeleteCar,
} = require("../controllers/carController");
const { protect, authorize } = require("../middlewares/auth");
const { upload } = require("../middlewares/upload");

router.route("/").get(getCars);
router.get("/:id", getCar);

router.use(protect);
router.post(
  "/",
  authorize("admin", "staff"),
  upload.array("images", 5),
  createCar,
);
router.put(
  "/:id",
  authorize("admin", "staff"),
  upload.array("images", 5),
  updateCar,
);
// Update only the status of a car (admin/staff)
router.put(
  "/:id/status",
  protect,
  authorize("admin", "staff"),
  async (req, res, next) => {
    try {
      const { status } = req.body;
      if (!["available", "rented", "maintenance"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      const car = await Car.findByIdAndUpdate(
        req.params.id,
        { status },
        { new: true, runValidators: true },
      );
      if (!car) return res.status(404).json({ message: "Car not found" });
      await cacheDel("cars:*");
      res.json(car);
    } catch (error) {
      next(error);
    }
  },
);
router.delete("/:id", authorize("admin", "staff"), deleteCar);
router.delete("/:id/permanent", authorize("admin"), permanentDeleteCar);

module.exports = router;
