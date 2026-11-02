# Equipo Linux de laboratorio con agentes reales: net-snmp (snmpd) y OpenSSH.
# A diferencia de lab:snmp y lab:ssh (simulados), responde con datos reales del
# contenedor: uptime, interfaces y contadores de tráfico.
# Uso: npm.cmd run lab:linux (ver docs/TRASPASO.md).
FROM debian:12-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends snmpd openssh-server iproute2 procps \
  && rm -rf /var/lib/apt/lists/* \
  && mkdir -p /run/sshd \
  && useradd --create-home --shell /bin/bash tecnico \
  && echo 'tecnico:laboratorio' | chpasswd

# Solo lectura, con una comunidad propia para probar que la app no asume "public".
RUN printf '%s\n' \
  'agentaddress udp:161' \
  'rocommunity tp6-lab default' \
  'sysLocation Laboratorio TP6 (Docker)' \
  'sysContact tp6' > /etc/snmp/snmpd.conf

RUN printf '%s\n' \
  'PasswordAuthentication yes' \
  'PermitRootLogin no' \
  'AllowUsers tecnico' > /etc/ssh/sshd_config.d/tp6.conf

EXPOSE 22 161/udp
CMD ["/bin/sh", "-c", "/usr/sbin/sshd && exec /usr/sbin/snmpd -f -Lo -C -c /etc/snmp/snmpd.conf"]
