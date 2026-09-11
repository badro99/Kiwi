ALTER TABLE hotel_internal_request_lines
  ADD COLUMN substitute_unit TEXT NOT NULL DEFAULT '';
ALTER TABLE hotel_internal_request_lines
  ADD COLUMN substitute_conversion_snapshot TEXT NOT NULL DEFAULT '{}';
ALTER TABLE hotel_internal_request_lines
  ADD COLUMN substitute_reason TEXT NOT NULL DEFAULT '';
