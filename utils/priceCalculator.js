const Coupon = require("../models/Coupon");

exports.calculateTotal = async (
  car,
  pickupDate,
  dropoffDate,
  extras = [],
  couponCode = null,
) => {
  const days = Math.ceil(
    (new Date(dropoffDate) - new Date(pickupDate)) / (1000 * 60 * 60 * 24),
  );
  if (days < 1) throw new Error("Minimum 1 day rental");

  let base = car.dailyRate * days;
  // Apply weekly discount if applicable
  if (days >= 7 && car.weeklyRate) {
    const weeks = Math.floor(days / 7);
    const remaining = days % 7;
    base = weeks * car.weeklyRate + remaining * car.dailyRate;
  }

  // Extras (e.g., GPS: 200/day)
  let extrasCost = 0;
  const extraRates = { GPS: 200, "Child Seat": 150 };
  extras.forEach((extra) => {
    extrasCost += (extraRates[extra] || 0) * days;
  });

  let total = base + extrasCost;
  let tax = total * 0.15; // 15% VAT
  total += tax;

  let discount = 0;
  if (couponCode) {
    const coupon = await Coupon.findOne({
      code: couponCode.toUpperCase(),
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
    if (
      coupon &&
      (coupon.usageLimit === 0 || coupon.usedCount < coupon.usageLimit)
    ) {
      if (coupon.minBookingAmount && total < coupon.minBookingAmount) {
        // ignore
      } else {
        if (coupon.discountType === "percentage") {
          discount = (total * coupon.discountValue) / 100;
          if (coupon.maxDiscount && discount > coupon.maxDiscount)
            discount = coupon.maxDiscount;
        } else {
          discount = coupon.discountValue;
        }
        coupon.usedCount += 1;
        await coupon.save();
      }
    }
  }

  total = total - discount;
  return { total, tax, discount };
};
