# _helpers.tpl — FleetAI service library chart helpers

{{- define "fleetai.name" -}}
{{- .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fleetai.fullname" -}}
{{- printf "%s-%s" .Release.Name .Values.name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "fleetai.labels" -}}
app.kubernetes.io/name: {{ include "fleetai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .Values.name }}
app.kubernetes.io/version: {{ .Values.image.tag | default .Chart.AppVersion }}
{{- end -}}

{{- define "fleetai.selectorLabels" -}}
app.kubernetes.io/name: {{ include "fleetai.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/component: {{ .Values.name }}
{{- end -}}
