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

contract EthereumID is owned {
    event Registered(address addr, string email);
    event RegisteredVerified(address addr, string email);
    event Unregistered(address addr, string email);
    event UnregisteredVerified(address addr, string email);

    mapping (address => string) public verifiedEmailOf;
    string public identityType;

    function EthereumID(string _identityType) {
        identityType = _identityType;
    }
    
    function () {
        throw;
    }

    function register(string email) {
        Registered(msg.sender, email);
    }

    function unregister(string email) {
        Unregistered(msg.sender, email);
    }

    function _setVerifiedIdentity(address addr, string email) ownerOnly {
        verifiedEmailOf[addr] = email;
        RegisteredVerified(addr, email);
    }

    function _delVerifiedIdentity(address addr, string email) ownerOnly {
        verifiedEmailOf[addr] = "";
        UnregisteredVerified(addr, email);
    }
}