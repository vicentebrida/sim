{{- define "sim.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "sim.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else if contains (include "sim.name" .) .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "sim.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "sim.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "sim.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end -}}

{{- define "sim.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sim.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{- define "sim.serviceAccountName" -}}
{{- if .Values.serviceAccount.create -}}
{{- default (include "sim.fullname" .) .Values.serviceAccount.name -}}
{{- else -}}
{{- default "default" .Values.serviceAccount.name -}}
{{- end -}}
{{- end -}}

{{- define "sim.image" -}}
{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}

{{/* Postgres password: the given one, the one already in the cluster, or a new random one. */}}
{{- define "sim.postgresPassword" -}}
{{- if .Values.postgresql.password -}}
{{- .Values.postgresql.password -}}
{{- else -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace (printf "%s-database" (include "sim.fullname" .)) -}}
{{- if and $existing $existing.data (index $existing.data "POSTGRES_PASSWORD") -}}
{{- index $existing.data "POSTGRES_PASSWORD" | b64dec -}}
{{- else -}}
{{- randAlphaNum 32 -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{/* Where DATABASE_URL and REDIS_URL come from, as `env` entries. */}}
{{- define "sim.connectionEnv" -}}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
{{- if .Values.postgresql.enabled }}
      name: {{ include "sim.fullname" . }}-database
      key: DATABASE_URL
{{- else if .Values.externalDatabase.existingSecret }}
      name: {{ .Values.externalDatabase.existingSecret }}
      key: {{ .Values.externalDatabase.existingSecretKey }}
{{- else }}
      name: {{ include "sim.fullname" . }}-database
      key: DATABASE_URL
{{- end }}
{{- if .Values.redis.enabled }}
- name: REDIS_URL
  value: {{ printf "redis://%s-redis:6379" (include "sim.fullname" .) | quote }}
{{- else if .Values.externalRedis.existingSecret }}
- name: REDIS_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalRedis.existingSecret }}
      key: {{ .Values.externalRedis.existingSecretKey }}
{{- else if .Values.externalRedis.url }}
- name: REDIS_URL
  value: {{ .Values.externalRedis.url | quote }}
{{- end }}
{{- end -}}

{{/* The pod spec shared by the web and worker Deployments. */}}
{{- define "sim.pod" -}}
{{- $root := .root -}}
{{- $part := .part -}}
{{- $mode := .mode -}}
serviceAccountName: {{ include "sim.serviceAccountName" $root }}
{{- with $root.Values.imagePullSecrets }}
imagePullSecrets:
  {{- toYaml . | nindent 2 }}
{{- end }}
securityContext:
  {{- toYaml $root.Values.podSecurityContext | nindent 2 }}
containers:
  - name: sim
    image: {{ include "sim.image" $root }}
    imagePullPolicy: {{ $root.Values.image.pullPolicy }}
    securityContext:
      {{- toYaml $root.Values.securityContext | nindent 6 }}
    env:
      - name: SIM_MODE
        value: {{ $mode }}
      - name: SIM_PUBLIC_URL
        value: {{ required "publicUrl is required (e.g. https://ideias.empresa.com.br)" $root.Values.publicUrl | quote }}
      {{- include "sim.connectionEnv" $root | nindent 6 }}
      {{- range $name, $value := $root.Values.env }}
      - name: {{ $name }}
        value: {{ $value | toString | quote }}
      {{- end }}
    {{- if or $root.Values.secretEnv $root.Values.existingSecret }}
    envFrom:
      {{- if $root.Values.secretEnv }}
      - secretRef:
          name: {{ include "sim.fullname" $root }}-env
      {{- end }}
      {{- if $root.Values.existingSecret }}
      - secretRef:
          name: {{ $root.Values.existingSecret }}
      {{- end }}
    {{- end }}
    {{- if ne $mode "worker" }}
    ports:
      - name: http
        containerPort: 3000
    readinessProbe:
      httpGet:
        path: /api/health
        port: http
      periodSeconds: 10
    livenessProbe:
      httpGet:
        path: /api/health
        port: http
      initialDelaySeconds: 30
      periodSeconds: 20
      failureThreshold: 6
    startupProbe:
      httpGet:
        path: /api/health
        port: http
      periodSeconds: 5
      # Migrations run on start: give them up to 5 minutes.
      failureThreshold: 60
    {{- end }}
    resources:
      {{- toYaml (index $root.Values $part).resources | nindent 6 }}
    volumeMounts:
      - name: data
        mountPath: /data
      - name: tmp
        mountPath: /tmp
volumes:
  - name: data
    {{- if $root.Values.persistence.enabled }}
    persistentVolumeClaim:
      claimName: {{ $root.Values.persistence.existingClaim | default (printf "%s-data" (include "sim.fullname" $root)) }}
    {{- else }}
    emptyDir: {}
    {{- end }}
  - name: tmp
    emptyDir: {}
{{- with (index $root.Values $part).nodeSelector }}
nodeSelector:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with (index $root.Values $part).tolerations }}
tolerations:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- with (index $root.Values $part).affinity }}
affinity:
  {{- toYaml . | nindent 2 }}
{{- end }}
{{- end -}}
