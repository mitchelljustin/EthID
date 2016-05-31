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
    struct Identity {
        string identityValue;
        uint verifiedAt;
    }

    event Linked(address addr, string identityValue);
    event Unlinked(address addr, string identityValue);
    event IdentityVerified(address addr, string identityValue);

    mapping (address => Identity) public verifiedIdentityOf;
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
        Identity identity = verifiedIdentityOf[msg.sender];
        if (bytes(identity.identityValue).length == 0) {
            throw;
        }
        Unlinked(msg.sender, identity.identityValue);
        delete verifiedIdentityOf[msg.sender];
    }

    function _setVerifiedIdentity(address addr, string identityValue) ownerOnly {
        verifiedIdentityOf[addr] = Identity(identityValue, now);
        IdentityVerified(addr, identityValue);
    }
}