-- Migration 063: add face_descriptor to profiles for facial recognition time clock
-- Stores a 128-element float array (face-api.js FaceDescriptor)

alter table public.profiles
  add column if not exists face_descriptor float8[];

comment on column public.profiles.face_descriptor is
  'face-api.js 128-dim face descriptor for facial recognition time clock. NULL = not enrolled.';
