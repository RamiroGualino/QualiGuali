# RUNBOOK

Guía operativa de QualiGuali: cómo levantar el entorno, cómo debuggear un servicio individual, y
qué hacer en AWS real (rotar secretos, leer logs) una vez que el sistema corre en la nube. Ver
también `QualiGuali_Arquitectura_v1.2.md` para el diseño y `.github/workflows/` para el detalle de
CI/CD.

## 1. Levantar el entorno local completo

Requisitos: Node.js >= 20, pnpm, Docker + Docker Compose.

```bash
cp .env.example .env        # ajustar si hace falta; los defaults ya funcionan
docker-compose up --build
```

Esto levanta, en este orden de dependencias:

1. `mongo` — única instancia, base compartida `qualiguali` (sin bases por servicio).
2. `minio` — S3-compatible, para evidencias y reportes crudos de automatización.
3. `localstack` — simula SNS/SQS; `infra/localstack-init.sh` crea el topic y la cola al arrancar.
4. Los 6 servicios backend (`auth-service` 4000, `projects-service` 4001, `qa-core-service` 4002,
   `execution-service` 4003, `defects-service` 4004, `reports-service` 4005).
5. `web` — frontend Vite (5173), apunta a los 6 servicios anteriores vía `localhost`.

Para descartar estado previo (ej. antes de validar que todo levanta desde cero):

```bash
docker-compose down -v      # -v también borra los volúmenes (Mongo, MinIO, LocalStack)
docker-compose up --build
```

El Super Admin inicial no se crea vía API — hay que correr el seed dentro del contenedor (o
localmente contra el mismo Mongo):

```bash
docker-compose exec auth-service pnpm seed
```

## 2. Correr un servicio individual fuera de docker-compose (debug)

Útil para debuggear con breakpoints, logs más verbosos, o un debugger adjunto — cosas incómodas
dentro de un contenedor.

1. Levantar solo la infraestructura compartida que el servicio necesita:
   ```bash
   docker-compose up mongo minio localstack
   ```
2. En el servicio a debuggear, copiar su `.env.example` a `.env` y ajustar las URLs para que
   apunten a `localhost` en vez de a los hostnames internos de Docker (`mongo`, `minio`,
   `localstack`) — los `.env.example` de cada servicio ya vienen con `localhost` por defecto,
   pensados exactamente para este caso.
3. Correrlo directo con pnpm, fuera de Docker:
   ```bash
   pnpm --filter execution-service dev   # o el servicio que corresponda
   ```
4. Los demás servicios de los que dependa (ej. `execution-service` valida `projectId` contra
   `projects-service`) siguen corriendo en docker-compose normalmente — no hace falta bajarlos,
   solo asegurarse de que el `.env` del servicio en debug apunte a sus puertos publicados
   (`http://localhost:400X`).

## 3. Rotar un secreto en AWS Secrets Manager

No implementado en este sandbox (sin credenciales AWS reales) — procedimiento documentado para
cuando el equipo tenga la cuenta real:

```bash
# 1. Generar/definir el nuevo valor y actualizarlo en Secrets Manager
aws secretsmanager put-secret-value \
  --secret-id qualiguali/jwt-secret \
  --secret-string '<nuevo-valor>'

# 2. Redesplegar los servicios que lo consumen para que levanten el nuevo valor
#    (ninguno de los servicios hace hot-reload de secretos; hace falta reiniciar el proceso).
aws ssm send-command \
  --instance-ids "$EC2_INSTANCE_ID" \
  --document-name "AWS-RunShellScript" \
  --parameters 'commands=["cd /opt/qualiguali && docker compose up -d"]'
```

**JWT_SECRET en particular**: como cada servicio lo verifica localmente (sin round-trip a
`auth-service`), rotarlo invalida de golpe todas las sesiones activas — todo Access Token emitido
con el secreto viejo deja de validar en cuanto el nuevo valor esté desplegado en todos los
servicios. No hay soporte para rotación con solapamiento (dos secretos válidos a la vez); si eso
se vuelve necesario, es un `[DECISIÓN PENDIENTE]` de diseño, no algo que resolver ad-hoc en un
runbook.

## 4. Leer logs en CloudWatch

No implementado en este sandbox — procedimiento para cuando el EC2 de dev/prod exista:

- Los contenedores de `docker-compose` en el host EC2 deben tener el CloudWatch Logs agent (o el
  `awslogs` log driver de Docker) configurado apuntando a un log group por servicio, ej.
  `/qualiguali/dev/auth-service`.
- Consulta rápida desde la CLI:
  ```bash
  aws logs tail /qualiguali/dev/auth-service --follow
  ```
- **`[DECISIÓN PENDIENTE]`**: el `docker-compose.yml` actual no configura el `awslogs` driver
  todavía (los contenedores solo loguean a stdout/stderr local) — se agrega cuando exista el host
  EC2 real, ya que requiere el log group creado de antemano y el rol IAM de la instancia con
  permiso `logs:PutLogEvents`.

## 5. CI/CD — qué corre y qué falta configurar

### `.github/workflows/ci.yml`

En cada push/PR, un job `changes` (usa `dorny/paths-filter`) detecta qué paquete(s) cambiaron; solo
esos jobs corren lint + test (más `packages/shared` si cambió, ya que todo depende de él vía el
workspace de pnpm). Un push que solo toca `services/defects-service/**` dispara únicamente el job
`defects-service`. No requiere secretos ni configuración adicional — corre out-of-the-box en
cualquier fork.

### `.github/workflows/deploy.yml` + `_build-push-deploy.yml`

En cada push a `main`: el mismo detector de cambios decide qué imágenes reconstruir; cada una se
buildea, se sube a ECR, y se redespliega automáticamente en el host EC2 de **dev** vía
`aws ssm send-command` (sin manejar claves SSH — usa el agente SSM ya instalado en la instancia).
El job `deploy-production` requiere que alguien apruebe manualmente antes de correr.

Para que esto funcione en un repo real, falta configurar manualmente:

- **Secrets del repo** (Settings > Secrets and variables > Actions):
  - `AWS_DEPLOY_ROLE_ARN` — rol IAM (OIDC, sin access keys de larga duración) con permisos de
    push a ECR y `ssm:SendCommand`.
  - `DEV_EC2_INSTANCE_ID` — id de la instancia EC2 de dev. **`[DECISIÓN PENDIENTE]`**: esta
    instancia no está provisionada todavía en este sandbox.
  - `PROD_EC2_INSTANCE_ID` — igual, para prod. **`[DECISIÓN PENDIENTE]`**: la infraestructura de
    prod (más allá de "EC2 + docker-compose, igual que dev") no está decidida — ver §6.
- **Variables del repo** (opcional): `AWS_REGION` (default `us-east-1` si no se define).
- **Repositorios ECR**: uno por componente (`qualiguali/auth-service`, `qualiguali/projects-service`,
  `qualiguali/qa-core-service`, `qualiguali/execution-service`, `qualiguali/defects-service`,
  `qualiguali/reports-service`, `qualiguali/web`) — no se crean automáticamente desde el workflow.
- **GitHub Environment `production`** (Settings > Environments > New environment > `production`):
  agregar **required reviewers** ahí es lo que efectivamente convierte `deploy-production` en un
  gate manual — no es algo expresable en el YAML del workflow, se configura en la UI del repo.
- **Host(s) EC2**: deben tener el agente SSM corriendo, Docker + Docker Compose instalados, este
  repo (o al menos su `docker-compose.yml` + `.env`) en `/opt/qualiguali`, y estar logueados
  contra el ECR correspondiente (o el rol de instancia con permiso `ecr:GetAuthorizationToken` +
  `ecr:BatchGetImage`, y un `docker login` en el pull).

## 6. `[DECISIÓN PENDIENTE]` — Migración futura de EC2+Docker Compose a algo más gestionado

Mencionado como plan futuro en la arquitectura (v1.0 §6.2), no implementado en esta parte:

- Migrar de "un EC2 corriendo `docker-compose up`" a ECS (Fargate) o EKS para orquestación,
  autoscaling y rolling deploys sin downtime.
- Reemplazar el LocalStack local por SNS/SQS reales de la cuenta AWS (ya soportado en código —
  `createEventPublisher` solo necesita `SNS_TOPIC_ARN` apuntando a un topic real; falta la
  IaC/provisioning).
- Reemplazar MinIO por S3 real (mismo caso: el código ya usa `@aws-sdk/client-s3`, solo cambia la
  configuración de endpoint/credenciales).
- API Gateway real en vez de que el frontend le pegue directo a cada servicio — no está definido
  todavía si eso se resuelve con API Gateway de AWS, un reverse proxy propio, o se mantiene así.
- Ambiente de staging — explícitamente fuera de alcance por ahora (v1.0 §6.1 define solo dev y
  prod).

No se implementa nada de esto ahora porque no estaba ya definido en la arquitectura de referencia;
queda documentado acá para que el Architect lo priorice cuando corresponda.
