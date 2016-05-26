#!/bin/bash -x

echo Starting geth setup with ${GETHFLAGS}..

# Generate and store a wallet password
if [ ! -f ~/.accountpassword ]; then
    echo `date +%s | sha256sum | base64 | head -c 32` > ~/.accountpassword
fi

if [ ! -f ~/.primaryaccount ]; then
    geth ${GETHFLAGS} --password ~/.accountpassword account new > ~/.primaryaccount
fi

echo Account info:
cat ~/.accountpassword
cat ~/.primaryaccount
echo ---

geth ${GETHFLAGS} --rpc --rpcaddr "0.0.0.0" --rpccorsdomain "*" --password ~/.accountpassword --unlock 0