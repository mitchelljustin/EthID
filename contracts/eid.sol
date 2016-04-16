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

contract EID is owned {
    event Registered(address addr, string email);
    event RegisteredVerified(address addr, string email);
    event Unregistered(address addr, string email);
    event UnregisteredVerified(address addr, string email);

    mapping (address => string) verifiedEmailOf;
    mapping (string => address) verifiedAddressOf;

    function register(string email) {
        Registered(msg.sender, email);
    }

    function unregister(string email) {
        Unregistered(msg.sender, email);
    }

    function _verifyRegistered(address addr, string email) ownerOnly {
        if (addr == address(0x0)) {
            throw;
        }
        if (bytes(email).length == 0) {
            throw;
        }
        if (bytes(verifiedEmailOf[addr]).length != 0) {
            throw;
        }
        if (verifiedAddressOf[email] != address(0x0)) { // Already registered
            throw;
        }
        verifiedEmailOf[addr] = email;
        verifiedAddressOf[email] = addr;
        RegisteredVerified(addr, email);
    }

    function _verifyUnregistered(address addr, string email) ownerOnly {
        if (addr == address(0x0)) {
            throw;
        }
        if (bytes(email).length == 0) {
            throw;
        }
        if (verifiedAddressOf[email] != addr) {
            throw;
        }
        verifiedAddressOf[email] = address(0x0);
        verifiedEmailOf[addr] = "";
        UnregisteredVerified(addr, email);
    }
}