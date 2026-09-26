UPDATE finance_entries
SET amount = (
      SELECT MAX(0, bookings.amount - MIN(bookings.refund_amount, bookings.amount))
      FROM dashboard_bookings AS bookings
      WHERE bookings.income_entry_id = finance_entries.id
    ),
    description = (
      SELECT 'Booking ' || bookings.id || ' - ' || bookings.guest ||
        ' | Dibatalkan: refund Rp ' || bookings.refund_amount ||
        '; alasan: ' || bookings.cancellation_reason ||
        '; pemasukan bersih Rp ' || MAX(0, bookings.amount - MIN(bookings.refund_amount, bookings.amount))
      FROM dashboard_bookings AS bookings
      WHERE bookings.income_entry_id = finance_entries.id
    )
WHERE kind = 'income'
  AND id IN (
    SELECT income_entry_id
    FROM dashboard_bookings
    WHERE status = 'Cancelled'
  );

UPDATE finance_entries
SET amount = (
      SELECT MAX(0, bookings.extra_bed_quantity * bookings.extra_bed_price - MAX(0, bookings.refund_amount - bookings.amount))
      FROM dashboard_bookings AS bookings
      WHERE 'booking-extra-bed-' || bookings.id = finance_entries.id
    ),
    description = (
      SELECT 'Extra Bed (' || bookings.extra_bed_quantity || ' x Rp ' || bookings.extra_bed_price ||
        ') - Booking ' || bookings.id ||
        CASE WHEN bookings.refund_amount > bookings.amount THEN
          ' - Refund Extra Bed Rp ' || (bookings.refund_amount - bookings.amount) || ': ' || bookings.cancellation_reason
        ELSE '' END
      FROM dashboard_bookings AS bookings
      WHERE 'booking-extra-bed-' || bookings.id = finance_entries.id
    )
WHERE kind = 'income'
  AND id IN (
    SELECT 'booking-extra-bed-' || id
    FROM dashboard_bookings
    WHERE status = 'Cancelled' AND extra_bed_quantity * extra_bed_price > 0
  );

DELETE FROM finance_entries
WHERE category_id = 'expense-booking-refund'
  AND EXISTS (
    SELECT 1
    FROM dashboard_bookings AS bookings
    WHERE bookings.status = 'Cancelled'
      AND (
        bookings.refund_entry_id = finance_entries.id
        OR 'booking-refund-' || bookings.id = finance_entries.id
      )
  );

UPDATE dashboard_bookings
SET refund_entry_id = NULL
WHERE status = 'Cancelled';