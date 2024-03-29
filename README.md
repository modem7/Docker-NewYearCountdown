# Self Hosted, self contained New Year Countdown clock

![Docker Pulls](https://img.shields.io/docker/pulls/modem7/newyearcountdown) ![Docker Image Size (tag)](https://img.shields.io/docker/image-size/modem7/newyearcountdown/latest)
[![Build Status](https://drone.modem7.com/api/badges/modem7/Docker-NewYearCountdown/status.svg)](https://drone.modem7.com/modem7/Docker-NewYearCountdown)

[!["Buy Me A Coffee"](https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png)](https://www.buymeacoffee.com/modem7)

Web app that counts down to next January 1st. It selects automatically the next year (based on local system time). Background images are made with svg inline tags.

Ported to Docker container by Modem7.

See a preview: https://modem7.github.io/Docker-NewYearCountdown/

Original creator: https://github.com/patrickgold/newyear-countdown

# Container Screenshot
![image](https://user-images.githubusercontent.com/4349962/147395358-ec5bcffc-5bf2-4b43-af5f-5459f5d14b00.png)

# Breaking change
Due to changing the image to nginxinc/nginx-unprivileged, the ports have changed from `80` to `8080`. 
Please update your files accordingly.

# Configuration

```bash
version: "2.4"

services:

  newyearcountdown:
    image: modem7/newyearcountdown
    container_name: NewYearCountdown
    ports:
      - 8080:8080
```
