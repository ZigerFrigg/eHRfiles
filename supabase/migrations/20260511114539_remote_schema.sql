drop extension if exists "pg_net";

create type "public"."retention_status" as enum ('not started', 'started', 'expired', 'not set', 'legal hold');


  create table "public"."config" (
    "c_name" character varying(100) not null,
    "c_desc" character varying(255) not null,
    "c_value" text
      );



  create table "public"."countries" (
    "c_id" text not null,
    "c_desc" text not null
      );



  create table "public"."doc_groups" (
    "g_name" text not null
      );



  create table "public"."doc_types" (
    "d_key" text not null,
    "d_name" text not null,
    "d_group" text not null,
    "d_r_taxcode" text,
    "d_r_rule" text,
    "d_r_trigger" text,
    "d_r_month" integer
      );



  create table "public"."documents" (
    "d_id" uuid not null default gen_random_uuid(),
    "d_key" text not null,
    "d_date" timestamp with time zone not null default now(),
    "e_id" text,
    "e_compc" text,
    "e_wloc" text,
    "e_lhold" boolean not null default false,
    "e_hr" boolean not null default false,
    "e_geb" boolean not null default false,
    "d_file" text not null,
    "d_text" text,
    "d_hash" text not null,
    "d_pages" integer,
    "d_u_id" text not null,
    "d_c_fname" text not null,
    "d_c_lname" text not null,
    "d_case" text,
    "d_r_taxcode" text not null,
    "d_r_rule" text not null,
    "d_r_trigger" text not null,
    "d_r_month" integer not null,
    "d_r_deletion" date,
    "d_r_status" public.retention_status not null default 'not set'::public.retention_status,
    "d_stor" text not null default 'docs'::text,
    "d_path" text not null,
    "d_mime" text not null,
    "d_size" bigint not null
      );



  create table "public"."employees" (
    "e_id" text not null,
    "u_id" text,
    "e_fname" text,
    "e_lname" text,
    "e_class" text,
    "e_status" text,
    "e_join" date,
    "e_tdate" date,
    "e_wloc" text,
    "e_compc" text,
    "e_compn" text,
    "e_ouco" text,
    "e_ouna" text,
    "e_lhold" boolean not null default false,
    "e_hr" boolean not null default false,
    "e_geb" boolean not null default false,
    "e_upd" timestamp without time zone
      );



  create table "public"."functions" (
    "f_name" character varying(100) not null,
    "f_desc" character varying(255) not null
      );



  create table "public"."role_dt" (
    "rd_role" text not null,
    "rd_doctype" text not null
      );



  create table "public"."role_func" (
    "rf_role" character varying(100) not null,
    "rf_function" character varying(100) not null
      );



  create table "public"."roles" (
    "r_name" text not null,
    "r_desc" text not null
      );



  create table "public"."users" (
    "u_id" text not null,
    "u_email" text not null,
    "u_role" text not null,
    "u_cou" text not null,
    "u_hr" boolean not null default false,
    "u_geb" boolean not null default false
      );


CREATE UNIQUE INDEX config_pkey ON public.config USING btree (c_name);

CREATE UNIQUE INDEX countries_pkey ON public.countries USING btree (c_id);

CREATE UNIQUE INDEX doc_groups_pkey ON public.doc_groups USING btree (g_name);

CREATE INDEX doc_types_group_idx ON public.doc_types USING btree (d_group);

CREATE UNIQUE INDEX doc_types_pkey ON public.doc_types USING btree (d_key);

CREATE INDEX doc_types_taxcode_idx ON public.doc_types USING btree (d_r_taxcode);

CREATE INDEX documents_d_date_idx ON public.documents USING btree (d_date DESC);

CREATE INDEX documents_d_key_idx ON public.documents USING btree (d_key);

CREATE INDEX documents_e_id_idx ON public.documents USING btree (e_id);

CREATE INDEX documents_e_wloc_idx ON public.documents USING btree (e_wloc);

CREATE UNIQUE INDEX documents_pkey ON public.documents USING btree (d_id);

CREATE INDEX documents_r_del_idx ON public.documents USING btree (d_r_deletion);

CREATE INDEX documents_r_status_idx ON public.documents USING btree (d_r_status);

CREATE UNIQUE INDEX documents_stor_path_uk ON public.documents USING btree (d_stor, d_path);

CREATE UNIQUE INDEX employees_pkey ON public.employees USING btree (e_id);

CREATE UNIQUE INDEX functions_pkey ON public.functions USING btree (f_name);

CREATE INDEX idx_doc_types_d_group ON public.doc_types USING btree (d_group);

CREATE UNIQUE INDEX role_dt_pk ON public.role_dt USING btree (rd_role, rd_doctype);

CREATE INDEX role_func_function_idx ON public.role_func USING btree (rf_function);

CREATE UNIQUE INDEX role_func_pk ON public.role_func USING btree (rf_role, rf_function);

CREATE INDEX role_func_role_idx ON public.role_func USING btree (rf_role);

CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (r_name);

CREATE UNIQUE INDEX users_pkey ON public.users USING btree (u_id);

CREATE UNIQUE INDEX users_u_email_key ON public.users USING btree (u_email);

alter table "public"."config" add constraint "config_pkey" PRIMARY KEY using index "config_pkey";

alter table "public"."countries" add constraint "countries_pkey" PRIMARY KEY using index "countries_pkey";

alter table "public"."doc_groups" add constraint "doc_groups_pkey" PRIMARY KEY using index "doc_groups_pkey";

alter table "public"."doc_types" add constraint "doc_types_pkey" PRIMARY KEY using index "doc_types_pkey";

alter table "public"."documents" add constraint "documents_pkey" PRIMARY KEY using index "documents_pkey";

alter table "public"."employees" add constraint "employees_pkey" PRIMARY KEY using index "employees_pkey";

alter table "public"."functions" add constraint "functions_pkey" PRIMARY KEY using index "functions_pkey";

alter table "public"."role_dt" add constraint "role_dt_pk" PRIMARY KEY using index "role_dt_pk";

alter table "public"."role_func" add constraint "role_func_pk" PRIMARY KEY using index "role_func_pk";

alter table "public"."roles" add constraint "roles_pkey" PRIMARY KEY using index "roles_pkey";

alter table "public"."users" add constraint "users_pkey" PRIMARY KEY using index "users_pkey";

alter table "public"."config" add constraint "config_c_desc_len" CHECK ((char_length((c_desc)::text) <= 255)) not valid;

alter table "public"."config" validate constraint "config_c_desc_len";

alter table "public"."config" add constraint "config_c_name_len" CHECK ((char_length((c_name)::text) <= 100)) not valid;

alter table "public"."config" validate constraint "config_c_name_len";

alter table "public"."doc_types" add constraint "doc_types_d_group_fkey" FOREIGN KEY (d_group) REFERENCES public.doc_groups(g_name) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."doc_types" validate constraint "doc_types_d_group_fkey";

alter table "public"."doc_types" add constraint "doc_types_d_group_not_empty" CHECK ((length(TRIM(BOTH FROM d_group)) > 0)) not valid;

alter table "public"."doc_types" validate constraint "doc_types_d_group_not_empty";

alter table "public"."doc_types" add constraint "doc_types_d_key_not_empty" CHECK ((length(TRIM(BOTH FROM d_key)) > 0)) not valid;

alter table "public"."doc_types" validate constraint "doc_types_d_key_not_empty";

alter table "public"."doc_types" add constraint "doc_types_d_name_not_empty" CHECK ((length(TRIM(BOTH FROM d_name)) > 0)) not valid;

alter table "public"."doc_types" validate constraint "doc_types_d_name_not_empty";

alter table "public"."documents" add constraint "documents_d_key_fkey" FOREIGN KEY (d_key) REFERENCES public.doc_types(d_key) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."documents" validate constraint "documents_d_key_fkey";

alter table "public"."documents" add constraint "documents_d_r_month_check" CHECK ((d_r_month >= 0)) not valid;

alter table "public"."documents" validate constraint "documents_d_r_month_check";

alter table "public"."documents" add constraint "documents_d_size_check" CHECK ((d_size >= 0)) not valid;

alter table "public"."documents" validate constraint "documents_d_size_check";

alter table "public"."documents" add constraint "documents_d_u_id_fkey" FOREIGN KEY (d_u_id) REFERENCES public.users(u_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."documents" validate constraint "documents_d_u_id_fkey";

alter table "public"."documents" add constraint "documents_e_id_fkey" FOREIGN KEY (e_id) REFERENCES public.employees(e_id) ON UPDATE CASCADE ON DELETE RESTRICT not valid;

alter table "public"."documents" validate constraint "documents_e_id_fkey";

alter table "public"."employees" add constraint "employees_e_id_check" CHECK ((length(e_id) = 8)) not valid;

alter table "public"."employees" validate constraint "employees_e_id_check";

alter table "public"."employees" add constraint "employees_e_status_check" CHECK ((e_status = ANY (ARRAY['Active'::text, 'Terminated'::text]))) not valid;

alter table "public"."employees" validate constraint "employees_e_status_check";

alter table "public"."employees" add constraint "employees_e_wloc_fkey" FOREIGN KEY (e_wloc) REFERENCES public.countries(c_id) not valid;

alter table "public"."employees" validate constraint "employees_e_wloc_fkey";

alter table "public"."functions" add constraint "functions_f_desc_len" CHECK ((char_length((f_desc)::text) <= 255)) not valid;

alter table "public"."functions" validate constraint "functions_f_desc_len";

alter table "public"."functions" add constraint "functions_f_name_len" CHECK ((char_length((f_name)::text) <= 100)) not valid;

alter table "public"."functions" validate constraint "functions_f_name_len";

alter table "public"."role_dt" add constraint "role_dt_rd_doctype_fkey" FOREIGN KEY (rd_doctype) REFERENCES public.doc_groups(g_name) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."role_dt" validate constraint "role_dt_rd_doctype_fkey";

alter table "public"."role_dt" add constraint "role_dt_rd_role_fkey" FOREIGN KEY (rd_role) REFERENCES public.roles(r_name) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."role_dt" validate constraint "role_dt_rd_role_fkey";

alter table "public"."role_func" add constraint "role_func_rf_function_fkey" FOREIGN KEY (rf_function) REFERENCES public.functions(f_name) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."role_func" validate constraint "role_func_rf_function_fkey";

alter table "public"."role_func" add constraint "role_func_rf_role_fkey" FOREIGN KEY (rf_role) REFERENCES public.roles(r_name) ON UPDATE CASCADE ON DELETE CASCADE not valid;

alter table "public"."role_func" validate constraint "role_func_rf_role_fkey";

alter table "public"."users" add constraint "users_u_email_key" UNIQUE using index "users_u_email_key";

alter table "public"."users" add constraint "users_u_role_fkey" FOREIGN KEY (u_role) REFERENCES public.roles(r_name) not valid;

alter table "public"."users" validate constraint "users_u_role_fkey";

grant delete on table "public"."config" to "anon";

grant insert on table "public"."config" to "anon";

grant references on table "public"."config" to "anon";

grant select on table "public"."config" to "anon";

grant trigger on table "public"."config" to "anon";

grant truncate on table "public"."config" to "anon";

grant update on table "public"."config" to "anon";

grant delete on table "public"."config" to "authenticated";

grant insert on table "public"."config" to "authenticated";

grant references on table "public"."config" to "authenticated";

grant select on table "public"."config" to "authenticated";

grant trigger on table "public"."config" to "authenticated";

grant truncate on table "public"."config" to "authenticated";

grant update on table "public"."config" to "authenticated";

grant delete on table "public"."config" to "service_role";

grant insert on table "public"."config" to "service_role";

grant references on table "public"."config" to "service_role";

grant select on table "public"."config" to "service_role";

grant trigger on table "public"."config" to "service_role";

grant truncate on table "public"."config" to "service_role";

grant update on table "public"."config" to "service_role";

grant delete on table "public"."countries" to "anon";

grant insert on table "public"."countries" to "anon";

grant references on table "public"."countries" to "anon";

grant select on table "public"."countries" to "anon";

grant trigger on table "public"."countries" to "anon";

grant truncate on table "public"."countries" to "anon";

grant update on table "public"."countries" to "anon";

grant delete on table "public"."countries" to "authenticated";

grant insert on table "public"."countries" to "authenticated";

grant references on table "public"."countries" to "authenticated";

grant select on table "public"."countries" to "authenticated";

grant trigger on table "public"."countries" to "authenticated";

grant truncate on table "public"."countries" to "authenticated";

grant update on table "public"."countries" to "authenticated";

grant delete on table "public"."countries" to "service_role";

grant insert on table "public"."countries" to "service_role";

grant references on table "public"."countries" to "service_role";

grant select on table "public"."countries" to "service_role";

grant trigger on table "public"."countries" to "service_role";

grant truncate on table "public"."countries" to "service_role";

grant update on table "public"."countries" to "service_role";

grant delete on table "public"."doc_groups" to "anon";

grant insert on table "public"."doc_groups" to "anon";

grant references on table "public"."doc_groups" to "anon";

grant select on table "public"."doc_groups" to "anon";

grant trigger on table "public"."doc_groups" to "anon";

grant truncate on table "public"."doc_groups" to "anon";

grant update on table "public"."doc_groups" to "anon";

grant delete on table "public"."doc_groups" to "authenticated";

grant insert on table "public"."doc_groups" to "authenticated";

grant references on table "public"."doc_groups" to "authenticated";

grant select on table "public"."doc_groups" to "authenticated";

grant trigger on table "public"."doc_groups" to "authenticated";

grant truncate on table "public"."doc_groups" to "authenticated";

grant update on table "public"."doc_groups" to "authenticated";

grant delete on table "public"."doc_groups" to "service_role";

grant insert on table "public"."doc_groups" to "service_role";

grant references on table "public"."doc_groups" to "service_role";

grant select on table "public"."doc_groups" to "service_role";

grant trigger on table "public"."doc_groups" to "service_role";

grant truncate on table "public"."doc_groups" to "service_role";

grant update on table "public"."doc_groups" to "service_role";

grant delete on table "public"."doc_types" to "anon";

grant insert on table "public"."doc_types" to "anon";

grant references on table "public"."doc_types" to "anon";

grant select on table "public"."doc_types" to "anon";

grant trigger on table "public"."doc_types" to "anon";

grant truncate on table "public"."doc_types" to "anon";

grant update on table "public"."doc_types" to "anon";

grant delete on table "public"."doc_types" to "authenticated";

grant insert on table "public"."doc_types" to "authenticated";

grant references on table "public"."doc_types" to "authenticated";

grant select on table "public"."doc_types" to "authenticated";

grant trigger on table "public"."doc_types" to "authenticated";

grant truncate on table "public"."doc_types" to "authenticated";

grant update on table "public"."doc_types" to "authenticated";

grant delete on table "public"."doc_types" to "service_role";

grant insert on table "public"."doc_types" to "service_role";

grant references on table "public"."doc_types" to "service_role";

grant select on table "public"."doc_types" to "service_role";

grant trigger on table "public"."doc_types" to "service_role";

grant truncate on table "public"."doc_types" to "service_role";

grant update on table "public"."doc_types" to "service_role";

grant delete on table "public"."documents" to "anon";

grant insert on table "public"."documents" to "anon";

grant references on table "public"."documents" to "anon";

grant select on table "public"."documents" to "anon";

grant trigger on table "public"."documents" to "anon";

grant truncate on table "public"."documents" to "anon";

grant update on table "public"."documents" to "anon";

grant delete on table "public"."documents" to "authenticated";

grant insert on table "public"."documents" to "authenticated";

grant references on table "public"."documents" to "authenticated";

grant select on table "public"."documents" to "authenticated";

grant trigger on table "public"."documents" to "authenticated";

grant truncate on table "public"."documents" to "authenticated";

grant update on table "public"."documents" to "authenticated";

grant delete on table "public"."documents" to "service_role";

grant insert on table "public"."documents" to "service_role";

grant references on table "public"."documents" to "service_role";

grant select on table "public"."documents" to "service_role";

grant trigger on table "public"."documents" to "service_role";

grant truncate on table "public"."documents" to "service_role";

grant update on table "public"."documents" to "service_role";

grant delete on table "public"."employees" to "anon";

grant insert on table "public"."employees" to "anon";

grant references on table "public"."employees" to "anon";

grant select on table "public"."employees" to "anon";

grant trigger on table "public"."employees" to "anon";

grant truncate on table "public"."employees" to "anon";

grant update on table "public"."employees" to "anon";

grant delete on table "public"."employees" to "authenticated";

grant insert on table "public"."employees" to "authenticated";

grant references on table "public"."employees" to "authenticated";

grant select on table "public"."employees" to "authenticated";

grant trigger on table "public"."employees" to "authenticated";

grant truncate on table "public"."employees" to "authenticated";

grant update on table "public"."employees" to "authenticated";

grant delete on table "public"."employees" to "service_role";

grant insert on table "public"."employees" to "service_role";

grant references on table "public"."employees" to "service_role";

grant select on table "public"."employees" to "service_role";

grant trigger on table "public"."employees" to "service_role";

grant truncate on table "public"."employees" to "service_role";

grant update on table "public"."employees" to "service_role";

grant delete on table "public"."functions" to "anon";

grant insert on table "public"."functions" to "anon";

grant references on table "public"."functions" to "anon";

grant select on table "public"."functions" to "anon";

grant trigger on table "public"."functions" to "anon";

grant truncate on table "public"."functions" to "anon";

grant update on table "public"."functions" to "anon";

grant delete on table "public"."functions" to "authenticated";

grant insert on table "public"."functions" to "authenticated";

grant references on table "public"."functions" to "authenticated";

grant select on table "public"."functions" to "authenticated";

grant trigger on table "public"."functions" to "authenticated";

grant truncate on table "public"."functions" to "authenticated";

grant update on table "public"."functions" to "authenticated";

grant delete on table "public"."functions" to "service_role";

grant insert on table "public"."functions" to "service_role";

grant references on table "public"."functions" to "service_role";

grant select on table "public"."functions" to "service_role";

grant trigger on table "public"."functions" to "service_role";

grant truncate on table "public"."functions" to "service_role";

grant update on table "public"."functions" to "service_role";

grant delete on table "public"."role_dt" to "anon";

grant insert on table "public"."role_dt" to "anon";

grant references on table "public"."role_dt" to "anon";

grant select on table "public"."role_dt" to "anon";

grant trigger on table "public"."role_dt" to "anon";

grant truncate on table "public"."role_dt" to "anon";

grant update on table "public"."role_dt" to "anon";

grant delete on table "public"."role_dt" to "authenticated";

grant insert on table "public"."role_dt" to "authenticated";

grant references on table "public"."role_dt" to "authenticated";

grant select on table "public"."role_dt" to "authenticated";

grant trigger on table "public"."role_dt" to "authenticated";

grant truncate on table "public"."role_dt" to "authenticated";

grant update on table "public"."role_dt" to "authenticated";

grant delete on table "public"."role_dt" to "service_role";

grant insert on table "public"."role_dt" to "service_role";

grant references on table "public"."role_dt" to "service_role";

grant select on table "public"."role_dt" to "service_role";

grant trigger on table "public"."role_dt" to "service_role";

grant truncate on table "public"."role_dt" to "service_role";

grant update on table "public"."role_dt" to "service_role";

grant delete on table "public"."role_func" to "anon";

grant insert on table "public"."role_func" to "anon";

grant references on table "public"."role_func" to "anon";

grant select on table "public"."role_func" to "anon";

grant trigger on table "public"."role_func" to "anon";

grant truncate on table "public"."role_func" to "anon";

grant update on table "public"."role_func" to "anon";

grant delete on table "public"."role_func" to "authenticated";

grant insert on table "public"."role_func" to "authenticated";

grant references on table "public"."role_func" to "authenticated";

grant select on table "public"."role_func" to "authenticated";

grant trigger on table "public"."role_func" to "authenticated";

grant truncate on table "public"."role_func" to "authenticated";

grant update on table "public"."role_func" to "authenticated";

grant delete on table "public"."role_func" to "service_role";

grant insert on table "public"."role_func" to "service_role";

grant references on table "public"."role_func" to "service_role";

grant select on table "public"."role_func" to "service_role";

grant trigger on table "public"."role_func" to "service_role";

grant truncate on table "public"."role_func" to "service_role";

grant update on table "public"."role_func" to "service_role";

grant delete on table "public"."roles" to "anon";

grant insert on table "public"."roles" to "anon";

grant references on table "public"."roles" to "anon";

grant select on table "public"."roles" to "anon";

grant trigger on table "public"."roles" to "anon";

grant truncate on table "public"."roles" to "anon";

grant update on table "public"."roles" to "anon";

grant delete on table "public"."roles" to "authenticated";

grant insert on table "public"."roles" to "authenticated";

grant references on table "public"."roles" to "authenticated";

grant select on table "public"."roles" to "authenticated";

grant trigger on table "public"."roles" to "authenticated";

grant truncate on table "public"."roles" to "authenticated";

grant update on table "public"."roles" to "authenticated";

grant delete on table "public"."roles" to "service_role";

grant insert on table "public"."roles" to "service_role";

grant references on table "public"."roles" to "service_role";

grant select on table "public"."roles" to "service_role";

grant trigger on table "public"."roles" to "service_role";

grant truncate on table "public"."roles" to "service_role";

grant update on table "public"."roles" to "service_role";

grant delete on table "public"."users" to "anon";

grant insert on table "public"."users" to "anon";

grant references on table "public"."users" to "anon";

grant select on table "public"."users" to "anon";

grant trigger on table "public"."users" to "anon";

grant truncate on table "public"."users" to "anon";

grant update on table "public"."users" to "anon";

grant delete on table "public"."users" to "authenticated";

grant insert on table "public"."users" to "authenticated";

grant references on table "public"."users" to "authenticated";

grant select on table "public"."users" to "authenticated";

grant trigger on table "public"."users" to "authenticated";

grant truncate on table "public"."users" to "authenticated";

grant update on table "public"."users" to "authenticated";

grant delete on table "public"."users" to "service_role";

grant insert on table "public"."users" to "service_role";

grant references on table "public"."users" to "service_role";

grant select on table "public"."users" to "service_role";

grant trigger on table "public"."users" to "service_role";

grant truncate on table "public"."users" to "service_role";

grant update on table "public"."users" to "service_role";


  create policy "documents_insert_anon"
  on "public"."documents"
  as permissive
  for insert
  to anon
with check (true);



  create policy "storage_docs_insert_anon"
  on "storage"."objects"
  as permissive
  for insert
  to anon
with check ((bucket_id = 'docs'::text));



  create policy "storage_docs_insert_authenticated"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'docs'::text));



  create policy "storage_docs_select_anon"
  on "storage"."objects"
  as permissive
  for select
  to anon
using ((bucket_id = 'docs'::text));



  create policy "storage_docs_select_authenticated"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'docs'::text));



