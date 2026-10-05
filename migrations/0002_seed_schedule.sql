INSERT INTO subjects (id, name, short_name, color) VALUES
  ('subject-info-security', 'Информационные основы защиты информации', 'ИОЗИ', '#2563eb'),
  ('subject-economics', 'Основы экономики и финансовой грамотности', 'Экономика', '#0f766e'),
  ('subject-physical', 'Физическая культура', 'Физкультура', '#dc2626'),
  ('subject-ecology', 'Экология и безопасность жизнедеятельности', 'Экология и БЖД', '#65a30d'),
  ('subject-programming', 'Практикум по программированию', 'Программирование', '#7c3aed'),
  ('subject-philosophy', 'Философия', 'Философия', '#9333ea'),
  ('subject-certification', 'Сертификация и стандартизация средств информационной безопасности', 'Сертификация', '#d97706'),
  ('subject-sociology', 'Социология', 'Социология', '#0891b2');

INSERT INTO teachers (id, name) VALUES
  ('teacher-spitsar', 'Спицарь Л.Р.'),
  ('teacher-baimenova', 'Байменова А.С.'),
  ('teacher-vanchurina', 'Ванчурина А.П.'),
  ('teacher-kudryavtsev', 'Кудрявцев С.С.'),
  ('teacher-dyusenbekov', 'Дюсенбеков Б.Ж.'),
  ('teacher-mukanova', 'Муканова А.К.'),
  ('teacher-abdin', 'Абдин А.Ж.'),
  ('teacher-koshebaeva', 'Кошебаева Г.К.'),
  ('teacher-kutueva', 'Кутуева Л.А.'),
  ('teacher-ivleva', 'Ивлева Е.Н.'),
  ('teacher-yurchenko', 'Юрченко В.В.'),
  ('teacher-rakhimberlina', 'Рахимберлина А.А.');

INSERT INTO schedule_slots (id, subject_id, teacher_id, weekday, slot_number, start_time, end_time, week_type, building, room, valid_from, valid_until) VALUES
  ('slot-odd-1-1', 'subject-info-security', 'teacher-spitsar', 1, 1, '09:00', '10:45', 'odd', 'Главный корпус', '430а', '2026-09-01', '2026-12-12'),
  ('slot-odd-1-2', 'subject-economics', 'teacher-baimenova', 1, 2, '10:55', '12:40', 'odd', 'Корпус №1', '626', '2026-09-01', '2026-12-12'),
  ('slot-odd-2-1', 'subject-physical', 'teacher-vanchurina', 2, 1, '09:00', '10:45', 'odd', 'Спорткомплекс', 'Спортзал', '2026-09-01', '2026-12-12'),
  ('slot-odd-2-2', 'subject-ecology', 'teacher-kudryavtsev', 2, 2, '10:55', '12:40', 'odd', 'Корпус №2', '229', '2026-09-01', '2026-12-12'),
  ('slot-odd-3-2', 'subject-programming', 'teacher-dyusenbekov', 3, 2, '10:55', '12:40', 'odd', 'Главный корпус', '434б', '2026-09-01', '2026-12-12'),
  ('slot-odd-3-3', 'subject-philosophy', 'teacher-mukanova', 3, 3, '13:10', '14:55', 'odd', 'Главный корпус', '352', '2026-09-01', '2026-12-12'),
  ('slot-odd-4-1', 'subject-programming', 'teacher-abdin', 4, 1, '09:00', '10:45', 'odd', 'Главный корпус', '420', '2026-09-01', '2026-12-12'),
  ('slot-odd-4-2', 'subject-economics', 'teacher-koshebaeva', 4, 2, '10:55', '12:40', 'odd', 'Главный корпус', '352', '2026-09-01', '2026-12-12'),
  ('slot-odd-4-3', 'subject-philosophy', 'teacher-mukanova', 4, 3, '13:10', '14:55', 'odd', 'Корпус №1', '604', '2026-09-01', '2026-12-12'),
  ('slot-odd-4-4', 'subject-certification', 'teacher-kutueva', 4, 4, '15:05', '16:50', 'odd', 'Главный корпус', '400G', '2026-09-01', '2026-12-12'),
  ('slot-odd-5-1', 'subject-sociology', 'teacher-ivleva', 5, 1, '09:00', '10:45', 'odd', 'Главный корпус', '420', '2026-09-01', '2026-12-12'),
  ('slot-odd-5-2', 'subject-physical', 'teacher-vanchurina', 5, 2, '10:55', '12:40', 'odd', 'Спорткомплекс', 'Спортзал', '2026-09-01', '2026-12-12'),
  ('slot-even-1-1', 'subject-info-security', 'teacher-spitsar', 1, 1, '09:00', '10:45', 'even', 'Главный корпус', '430а', '2026-09-01', '2026-12-12'),
  ('slot-even-1-2', 'subject-info-security', 'teacher-spitsar', 1, 2, '10:55', '12:40', 'even', 'Главный корпус', '441', '2026-09-01', '2026-12-12'),
  ('slot-even-2-1', 'subject-physical', 'teacher-vanchurina', 2, 1, '09:00', '10:45', 'even', 'Спорткомплекс', 'Спортзал', '2026-09-01', '2026-12-12'),
  ('slot-even-2-2', 'subject-ecology', 'teacher-kudryavtsev', 2, 2, '10:55', '12:40', 'even', 'Корпус №2', '229', '2026-09-01', '2026-12-12'),
  ('slot-even-3-1', 'subject-certification', 'teacher-yurchenko', 3, 1, '09:00', '10:45', 'even', 'Главный корпус', '441', '2026-09-01', '2026-12-12'),
  ('slot-even-3-2', 'subject-programming', 'teacher-dyusenbekov', 3, 2, '10:55', '12:40', 'even', 'Главный корпус', '434б', '2026-09-01', '2026-12-12'),
  ('slot-even-3-3', 'subject-ecology', 'teacher-rakhimberlina', 3, 3, '13:10', '14:55', 'even', 'Корпус №2', '506', '2026-09-01', '2026-12-12'),
  ('slot-even-4-2', 'subject-economics', 'teacher-koshebaeva', 4, 2, '10:55', '12:40', 'even', 'Главный корпус', '352', '2026-09-01', '2026-12-12'),
  ('slot-even-4-3', 'subject-philosophy', 'teacher-mukanova', 4, 3, '13:10', '14:55', 'even', 'Корпус №1', '604', '2026-09-01', '2026-12-12'),
  ('slot-even-4-4', 'subject-certification', 'teacher-kutueva', 4, 4, '15:05', '16:50', 'even', 'Главный корпус', '400G', '2026-09-01', '2026-12-12'),
  ('slot-even-5-2', 'subject-physical', 'teacher-vanchurina', 5, 2, '10:55', '12:40', 'even', 'Спорткомплекс', 'Спортзал', '2026-09-01', '2026-12-12');

INSERT INTO integrations (id, provider, status, config_json) VALUES
  ('integration-telegram', 'telegram', 'disconnected', '{}'),
  ('integration-whatsapp', 'whatsapp', 'disconnected', '{}');

INSERT INTO settings (key, value_json) VALUES
  ('academic_period', '{"semesterStart":"2026-09-01","semesterEnd":"2026-12-12","anchorWeekDate":"2026-09-01","anchorWeekType":"odd"}'),
  ('automation', '{"enabled":true,"mode":"scheduled","times":["08:00","20:00"],"minimumConfidence":0.92,"previousMessages":5,"nextMessages":3}'),
  ('images', '{"mode":"archive"}');
