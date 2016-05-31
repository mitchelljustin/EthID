contract owned {
    address owner;

    function owned() {
        owner = msg.sender;
    }

    modifier ownerOnly() {
        if (msg.sender != owner) {
            throw;
        }
        _
    }
}

contract EthID is owned {
    event Linked(address addr, string identityValue);
    event Unlinked(address addr, string identityValue);
    event IdentityVerified(address addr, string identityValue);

    mapping (address => string) public verifiedIdentityOf;
    string public identityType;

    function EthID(string _identityType) {
        identityType = _identityType;
    }

    function () {
        throw;
    }

    function link(string identityValue) {
        Linked(msg.sender, identityValue);
    }

    function unlink() {
        string identityValue = verifiedIdentityOf[msg.sender];
        if (bytes(identityValue).length == 0) {
            throw;
        }
        Unlinked(msg.sender, identityValue);
        delete verifiedIdentityOf[msg.sender];
    }

    function _setVerifiedIdentity(address addr, string identityValue) ownerOnly {
        verifiedIdentityOf[addr] = identityValue;
        IdentityVerified(addr, identityValue);
    }
}