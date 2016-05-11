FROM ubuntu:wily

ENV DEBIAN_FRONTEND noninteractive

RUN apt-get update && \
    apt-get upgrade -q -y && \
    apt-get dist-upgrade -q -y && \
    apt-get install -q -y software-properties-common && \
    add-apt-repository ppa:ethereum/ethereum && \
    apt-get update && \
    apt-get install -q -y geth solc && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

EXPOSE 8545
EXPOSE 30303

ADD ./setup.sh /root/setup.sh
RUN chmod +x /root/setup.sh

WORKDIR /root

CMD ["sh", "/root/setup.sh"]