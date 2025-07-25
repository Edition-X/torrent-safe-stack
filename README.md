<!-- markdownlint-disable MD033 MD041 -->
<div align="center">

# 🛡️ TORRENT-SAFE-STACK 🛡️

<h3>A Secure, Private & Virus-Protected Torrenting Solution</h3>

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2.5+-blue.svg)](https://docs.docker.com/compose/)
[![qBittorrent](https://img.shields.io/badge/qBittorrent-4.5.5-green.svg)](https://www.qbittorrent.org/)
[![Gluetun](https://img.shields.io/badge/Gluetun-latest-orange.svg)](https://github.com/qdm12/gluetun)
[![ClamAV](https://img.shields.io/badge/ClamAV-latest-red.svg)](https://www.clamav.net/)

<img src="https://raw.githubusercontent.com/linuxserver/docker-templates/master/linuxserver.io/img/qbittorrent-logo.png" height="100px">
<br>

*A comprehensive Docker stack for secure torrenting with VPN protection and automatic virus scanning*

</div>

---

## 🚀 Features

- **🔒 VPN Integration**: All torrent traffic routed through a secure VPN tunnel (WireGuard)
- **🌐 Privacy Protection**: Your IP remains hidden while downloading
- **🦠 Virus Scanning**: Automatic scanning of downloaded files with ClamAV
- **📊 Easy Management**: Simple web UI for torrent management
- **🔄 Auto-Configuration**: Pre-configured services that work together seamlessly
- **🛠️ Customizable**: Easy to configure for your specific VPN provider

## 🏗️ Architecture

```
┌────────────────┐    ┌────────────────┐    ┌────────────────┐
│                │    │                │    │                │
│     Gluetun    │◄───┤   qBittorrent  │    │     ClamAV     │
│   (VPN Tunnel) │    │  (Torrent UI)  │    │ (Virus Scanner)│
│                │    │                │    │                │
└────────────────┘    └────────────────┘    └────────────────┘
        │                     │                     │
        ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────┐
│                                                         │
│                   Shared Downloads                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

## 📋 Prerequisites

- Docker and Docker Compose installed on your system
- A VPN subscription with WireGuard support (or OpenVPN)
- Basic understanding of networking concepts

## 🚀 Quick Start

1. **Clone this repository**
   ```bash
   git clone https://github.com/Edition-X/torrent-safe-stack.git
   cd torrent-safe-stack
   ```

2. **Configure your environment**
   ```bash
   cp .env.sample .env
   # Edit the .env file with your VPN credentials and settings
   nano .env
   ```

3. **Start the stack**
   ```bash
   make up
   ```

4. **Access qBittorrent WebUI**
   - Open `http://localhost:8080` in your browser
   - Default login: username `admin`, password `adminadmin`

## ⚙️ Configuration

### VPN Configuration

This stack is pre-configured to work with WireGuard VPN. Edit the `.env` file to include your VPN credentials:

```env
# WireGuard Configuration
WIREGUARD_PRIVATE_KEY=your_private_key_here
WIREGUARD_PUBLIC_KEY=your_public_key_here
WIREGUARD_ADDRESSES=your_wireguard_ip_here/32
WIREGUARD_ENDPOINT_IP=your_endpoint_ip_here
WIREGUARD_ENDPOINT_PORT=51820
WIREGUARD_PERSISTENT_KEEPALIVE=25
```

### LAN Access Configuration

To access the WebUI from other devices on your network, set your LAN subnet in the `.env` file:

```env
# LAN subnet allowed to access the WebUI
LAN_SUBNET=192.168.1.0/24
```

## 🛡️ Security Features

### 1. VPN Kill Switch

The Gluetun container acts as a kill switch - if the VPN connection fails, internet connectivity will be lost for the qBittorrent container, ensuring no leaks.

### 2. Automatic Virus Scanning

The ClamAV container automatically scans all downloaded files in the shared `/downloads` directory.

### 3. Network Isolation

qBittorrent runs within the Gluetun network namespace, ensuring all traffic is routed through the VPN.

## 📁 Directory Structure

```
./
├── clamav/           # ClamAV configuration and custom scripts
├── downloads/        # Downloaded files (shared between containers)
├── gluetun/          # Gluetun VPN configuration
├── qbittorrent/      # qBittorrent configuration
├── docker-compose.yml
├── .env              # Environment variables
└── README.md         # This file
```

## 🔍 Troubleshooting

### VPN Connection Issues

```bash
# Check if the VPN is connected
docker exec gluetun wget -qO- https://ipinfo.io/ip

# View VPN logs
docker logs gluetun
```

### qBittorrent Issues

```bash
# Restart qBittorrent
docker restart qbittorrent

# View qBittorrent logs
docker logs qbittorrent
```

## 🛠️ Advanced Usage

### Using Different VPN Providers

Gluetun supports many VPN providers. To use a different provider, modify the `docker-compose.yml` file's `environment` section for the gluetun service.

### Custom Scanning Rules

To customize ClamAV scanning behavior, you can modify the ClamAV configuration in the `clamav` directory.

## 🛠️ Makefile Usage

This project includes a Makefile for simplified management that properly sources the `.env` file for all commands.

```bash
make up      # Build (if needed) and start the stack
make down    # Stop and remove containers
make build   # Rebuild all images
make logs    # Tail logs from all services
make ps      # Show running containers
make scan    # Manually scan downloads folder with ClamAV
```

## 🔄 Updates

To update the stack to the latest versions:

```bash
docker compose pull
make up
```

## 📜 License

None

## ⚠️ Disclaimer

This stack is designed for downloading legal torrents. The author does not endorse or encourage downloading copyrighted material. Always respect copyright laws and the terms of service of your VPN provider.

---

<div align="center">

**Happy Safe Torrenting! 🚀**

</div>