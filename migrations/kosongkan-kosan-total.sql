UPDATE kosan_rooms SET tenant_name='', price=0, depo_amount=0, depo_refundable=0, status='vacant', notes=''; DELETE FROM kosan_room_payments; DELETE FROM kosan_room_requests;
